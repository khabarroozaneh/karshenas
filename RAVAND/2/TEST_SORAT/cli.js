#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const lhModule = require('lighthouse');
const lighthouse = lhModule.lighthouse || lhModule.default || lhModule;
const chromeLauncher = require('chrome-launcher');

function usage(code) {
  console.log(`
speedcheck — local PageSpeed-Insights-style audit (Lighthouse, no Google API)

Usage:
  node cli.js <url> [url2 url3 ...] [options]

Options:
  --file <path>        Read URLs from a file, one per line (# starts a comment)
  --csv <path>         Write a summary CSV (batch mode gives one row per URL)
  --runs <n>           Repeat the audit n times per URL and use the MEDIAN result
                       (1 = single run, default). n>=3 removes single-run noise for accuracy.
  --retry <n>          Retry a failed audit up to n extra times before giving up (default 0)
  --desktop            Run with desktop throttling (default: mobile, like PSI)
  --direct             Ignore the system proxy/VPN for Chrome (fixes ERR_CONNECTION_RESET)
  --max-wait-fcp <ms>  How long to wait for first paint (default 30000; raise for slow servers)
  --chrome-flag <flag> Extra Chrome switch, repeatable (e.g. --chrome-flag --disable-quic)
  --browser <name>     Browser channel to launch: chrome (default) or edge
  --json <file>        Write full Lighthouse JSON report (single URL only)
  --html <file>        Write Lighthouse HTML report (single URL only)
  --no-save            Do not write any files (stdout only)
  --help               Show this help

Exit codes:
  0  every URL audited successfully
  2  at least one URL could not be audited (reason is printed per URL)
  1  bad arguments

Examples:
  node cli.js https://example.com
  node cli.js https://a.com https://b.com --csv results.csv
  node cli.js --file leads.txt --csv leads.csv
  node cli.js https://example.com --desktop --json out.json --html out.html
`);
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {
    urls: [], desktop: false, json: null, html: null, save: true,
    direct: false, maxWaitForFcp: null, chromeFlags: [], csv: null, channel: null,
    runs: 1, retry: 0,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--help' || a === '-h') usage(0);
    else if (a === '--desktop') opts.desktop = true;
    else if (a === '--direct') opts.direct = true;
    else if (a === '--no-save') opts.save = false;
    else if (a === '--csv') opts.csv = args[++i];
    else if (a === '--runs') {
      opts.runs = Number(args[++i]);
      if (!Number.isInteger(opts.runs) || opts.runs < 1 || opts.runs > 9) {
        console.error('--runs needs an integer between 1 and 9');
        usage(1);
      }
    }
    else if (a === '--retry') {
      opts.retry = Number(args[++i]);
      if (!Number.isInteger(opts.retry) || opts.retry < 0 || opts.retry > 5) {
        console.error('--retry needs an integer between 0 and 5');
        usage(1);
      }
    }
    else if (a === '--file') {
      const f = args[++i];
      if (!f || !fs.existsSync(f)) { console.error(`URL file not found: ${f || ''}`); usage(1); }
      opts.urls.push(...readUrlFile(f));
    }
    else if (a === '--json') opts.json = args[++i];
    else if (a === '--html') opts.html = args[++i];
    else if (a === '--max-wait-fcp') {
      opts.maxWaitForFcp = Number(args[++i]);
      if (!Number.isFinite(opts.maxWaitForFcp) || opts.maxWaitForFcp <= 0) {
        console.error('--max-wait-fcp needs a positive number of milliseconds');
        usage(1);
      }
    }
    else if (a === '--browser') {
      const b = (args[++i] || '').toLowerCase();
      if (b !== 'chrome' && b !== 'edge') { console.error('--browser must be chrome or edge'); usage(1); }
      opts.channel = b === 'edge' ? 'msedge' : undefined;
    }
    else if (a === '--chrome-flag') opts.chromeFlags.push(args[++i]);
    else if (!a.startsWith('-')) opts.urls.push(a);
    else { console.error(`Unknown option: ${a}`); usage(1); }
  }
  if (!opts.urls.length) usage(1);
  return opts;
}

function readUrlFile(file) {
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

function normalizeUrl(u) {
  return /^https?:\/\//i.test(u) ? u : 'http://' + u;
}

function fmtMs(ms) {
  if (ms == null) return 'n/a';
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`;
}

function fmtBytes(b) {
  if (b == null) return 'n/a';
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(1)} ${u[i]}`;
}

function grade(score) {
  if (score == null) return 'n/a';
  const p = Math.round(score * 100);
  if (p >= 90) return 'GOOD';
  if (p >= 50) return 'NEEDS WORK';
  return 'POOR';
}

const METRIC_IDS = [
  ['first-contentful-paint', 'FCP'],
  ['largest-contentful-paint', 'LCP'],
  ['cumulative-layout-shift', 'CLS'],
  ['total-blocking-time', 'TBT'],
  ['speed-index', 'Speed Index'],
  ['interactive', 'TTI'],
  ['server-response-time', 'TTFB (server)'],
];

function collectOpportunities(lhr) {
  const out = [];
  for (const [id, audit] of Object.entries(lhr.audits)) {
    const d = audit.details;
    if (!d || d.type !== 'opportunity') continue;
    const ms = d.overallSavingsMs || 0;
    const kb = d.overallSavingsBytes || 0;
    if (ms < 50 && kb < 1024) continue;
    if (audit.score != null && audit.score >= 0.9) continue;
    out.push({ id, title: audit.title, ms, kb, display: audit.displayValue || '' });
  }
  return out.sort((a, b) => b.ms - a.ms);
}

function metricValue(lhr, id) {
  const a = lhr.audits[id];
  return a && a.numericValue != null ? a.numericValue : null;
}

/* --- تکرار آزمون و گرفتن میانه (دقت بالا) --- */

// شاخص‌هایی که با میانهٔ n اجرا جایگزین می‌شوند
const MEDIAN_METRIC_IDS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'cumulative-layout-shift',
  'total-blocking-time',
  'speed-index',
  'interactive',
  'server-response-time',
  'max-potential-fid',
];

function median(arr) {
  const a = arr.slice().sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return null;
  if (n % 2) return a[(n - 1) >> 1];
  return (a[n / 2 - 1] + a[n / 2]) / 2;
}

function displayForMetric(id, v) {
  if (v == null) return '';
  if (id === 'cumulative-layout-shift') return v.toFixed(3);
  if (v >= 1000) return `${(v / 1000).toFixed(2)} s`;
  return `${Math.round(v)} ms`;
}

function perfScore(h) {
  return (h.categories && h.categories.performance && h.categories.performance.score) || 0;
}

/**
 * از n اجرای موفق، یک گزارش «میانه» می‌سازد:
 * بدنهٔ گزارش از اجرایی که نزدیک‌ترین نمره به میانه است،
 * و هر شاخص عددی برابر میانهٔ همان شاخص در همهٔ اجراها.
 * ساختار خام Lighthouse حفظ می‌شود تا خط لوله بدون تغییر کار کند.
 */
function medianLhr(lhrs) {
  if (lhrs.length === 1) {
    lhrs[0].medianOfRuns = 1;
    return lhrs[0];
  }
  const scores = lhrs.map(perfScore);
  const medScore = median(scores);

  let base = lhrs[0];
  let bestDiff = Infinity;
  for (const h of lhrs) {
    const d = Math.abs(perfScore(h) - medScore);
    if (d < bestDiff) { bestDiff = d; base = h; }
  }

  const merged = JSON.parse(JSON.stringify(base));
  merged.audits = merged.audits || {};

  const runDetails = lhrs.map((h, i) => {
    const m = { run: i + 1, score: Math.round(perfScore(h) * 100), fetchTime: h.fetchTime || null };
    for (const id of MEDIAN_METRIC_IDS) m[id] = metricValue(h, id);
    return m;
  });

  const spread = {};
  for (const id of MEDIAN_METRIC_IDS) {
    const vals = lhrs.map(h => metricValue(h, id)).filter(v => v != null);
    if (!vals.length) continue;
    const m = median(vals);
    if (merged.audits[id]) {
      merged.audits[id].numericValue = m;
      merged.audits[id].displayValue = displayForMetric(id, m);
    }
    if (vals.length > 1) {
      spread[id] = { min: Math.min(...vals), max: Math.max(...vals), median: m };
    }
  }

  if (merged.categories && merged.categories.performance) {
    merged.categories.performance.score = medScore;
  }
  merged.medianOfRuns = lhrs.length;
  merged.runDetails = runDetails;
  if (Object.keys(spread).length) merged.runSpread = spread;
  return merged;
}

/**
 * یک URL را تا opts.runs بار موفق (با opts.retry تلاش اضافه) می‌سنجد
 * و { lhr: گزارش میانه, runs: همهٔ اجراهای موفق } برمی‌گرداند.
 */
async function auditWithRuns(url, opts, port) {
  const want = Math.max(1, opts.runs || 1);
  const maxAttempts = want + Math.max(0, opts.retry || 0);
  const okRuns = [];
  let lastErr = null;
  for (let attempt = 1; okRuns.length < want && attempt <= maxAttempts; attempt++) {
    const lhr = await runAudit(url, opts, port);
    if (lhr.runtimeError) {
      lastErr = lhr;
      continue;
    }
    okRuns.push(lhr);
  }
  if (!okRuns.length) return { lhr: lastErr, runs: [] };
  return { lhr: medianLhr(okRuns), runs: okRuns };
}

function summarize(lhr, url) {
  if (lhr.runtimeError) {
    return {
      url, ok: false, score: null,
      error: lhr.runtimeError.code,
      detail: lhr.runtimeError.message,
      fcp: null, lcp: null, cls: null, tbt: null, si: null, ttfb: null,
    };
  }
  const perf = lhr.categories.performance;
  return {
    url: lhr.finalDisplayedUrl || lhr.requestedUrl || url,
    ok: true,
    score: perf ? perf.score : null,
    error: null, detail: null,
    fcp: metricValue(lhr, 'first-contentful-paint'),
    lcp: metricValue(lhr, 'largest-contentful-paint'),
    cls: metricValue(lhr, 'cumulative-layout-shift'),
    tbt: metricValue(lhr, 'total-blocking-time'),
    si: metricValue(lhr, 'speed-index'),
    ttfb: metricValue(lhr, 'server-response-time'),
  };
}

function printDetailed(lhr, opts) {
  const perf = lhr.categories.performance;
  const score = perf ? perf.score : null;
  console.log('');
  console.log(`URL        : ${lhr.finalDisplayedUrl || lhr.requestedUrl}`);
  if (lhr.medianOfRuns && lhr.medianOfRuns > 1) {
    console.log(`Accuracy   : median of ${lhr.medianOfRuns} runs (per-run scores: ${(lhr.runDetails || []).map(r => r.score).join(', ')})`);
  }
  console.log(`Timestamp  : ${lhr.fetchTime}`);
  console.log(`Emulation  : ${opts.desktop ? 'desktop' : 'mobile (default, like PSI)'}${opts.direct ? ' | direct connection (no system proxy)' : ''}${opts.maxWaitForFcp != null ? ` | max-wait-fcp ${opts.maxWaitForFcp}ms` : ''}`);
  console.log(`Lighthouse : ${lhr.lighthouseVersion}`);
  console.log(`User agent : ${lhr.environment && lhr.environment.networkUserAgent}`);
  console.log('');
  console.log(`PERFORMANCE SCORE: ${score == null ? 'n/a' : Math.round(score * 100) + ' / 100'}  [${grade(score)}]`);
  console.log('');
  console.log('Metric                        Value        Grade');
  console.log('---------------------------------------------------------');
  for (const [id, label] of METRIC_IDS) {
    const a = lhr.audits[id];
    if (!a) continue;
    const value = a.numericValue != null
      ? (id === 'cumulative-layout-shift' ? a.numericValue.toFixed(3) : fmtMs(a.numericValue))
      : 'n/a';
    console.log(`${label.padEnd(28)} ${value.padEnd(12)} ${grade(a.score)}`);
  }
  const opps = collectOpportunities(lhr);
  if (opps.length) {
    console.log('');
    console.log('Opportunities (how Google-style PSI suggests you fix this):');
    for (const o of opps) {
      const savings = [];
      if (o.ms) savings.push(fmtMs(o.ms));
      if (o.kb) savings.push(fmtBytes(o.kb));
      console.log(`  - ${o.title}  (save ~${savings.join(' / ')})`);
    }
  }
  console.log('');
}

function reportPaths(lhr, url, opts) {
  let json = opts.json;
  let html = opts.html;
  if (opts.save && (!json || !html)) {
    const dir = path.join(process.cwd(), 'reports');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const shown = lhr.finalDisplayedUrl || lhr.requestedUrl || url;
    const host = shown.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/gi, '_');
    if (!json) json = path.join(dir, `${host}-${stamp}.json`);
    if (!html) html = path.join(dir, `${host}-${stamp}.html`);
  }
  return { json, html };
}

function saveReports(lhr, url, opts) {
  const { json, html } = reportPaths(lhr, url, opts);
  if (json) {
    fs.mkdirSync(path.dirname(path.resolve(json)), { recursive: true });
    fs.writeFileSync(json, JSON.stringify(lhr, null, 2));
  }
  if (html && !lhr.runtimeError) {
    fs.mkdirSync(path.dirname(path.resolve(html)), { recursive: true });
    const rg = require('lighthouse/report/generator/report-generator.js');
    const generateReport = rg.generateReport || (rg.ReportGenerator && rg.ReportGenerator.generateReport);
    fs.writeFileSync(html, generateReport(lhr, 'html'));
  }
  return { json, html: (html && !lhr.runtimeError) ? html : null };
}

function printSummaryTable(rows) {
  const head = `${'#'.padEnd(4)}${'SCORE'.padEnd(7)}${'GRADE'.padEnd(12)}${'LCP'.padEnd(10)}${'FCP'.padEnd(10)}${'CLS'.padEnd(8)}${'TBT'.padEnd(10)}URL / ERROR`;
  console.log('');
  console.log(head);
  console.log('-'.repeat(Math.min(120, head.length + 40)));
  rows.forEach((r, i) => {
    if (!r.ok) {
      console.log(`${String(i + 1).padEnd(4)}${'ERR'.padEnd(7)}${'-'.padEnd(12)}${'-'.padEnd(10)}${'-'.padEnd(10)}${'-'.padEnd(8)}${'-'.padEnd(10)}${r.url}  ->  ${r.error}`);
      return;
    }
    console.log(
      `${String(i + 1).padEnd(4)}` +
      `${r.score == null ? 'n/a' : Math.round(r.score * 100)}`.padEnd(7) +
      `${grade(r.score)}`.padEnd(12) +
      `${fmtMs(r.lcp)}`.padEnd(10) +
      `${fmtMs(r.fcp)}`.padEnd(10) +
      `${r.cls == null ? 'n/a' : r.cls.toFixed(3)}`.padEnd(8) +
      `${fmtMs(r.tbt)}`.padEnd(10) +
      r.url
    );
  });
  console.log('');
}

function writeCsv(rows, file) {
  const header = ['url', 'score', 'grade', 'fcp_ms', 'lcp_ms', 'cls', 'tbt_ms', 'speed_index_ms', 'ttfb_ms', 'error'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      JSON.stringify(r.url),
      r.score == null ? '' : Math.round(r.score * 100),
      r.ok ? grade(r.score) : '',
      r.fcp == null ? '' : Math.round(r.fcp),
      r.lcp == null ? '' : Math.round(r.lcp),
      r.cls == null ? '' : r.cls.toFixed(3),
      r.tbt == null ? '' : Math.round(r.tbt),
      r.si == null ? '' : Math.round(r.si),
      r.ttfb == null ? '' : Math.round(r.ttfb),
      r.error ? JSON.stringify(r.error) : '',
    ].join(','));
  }
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

async function runAudit(url, opts, port) {
  const flags = {
    port,
    output: 'json',
    logLevel: 'error',
    onlyCategories: ['performance'],
  };
  if (opts.maxWaitForFcp != null) flags.maxWaitForFcp = opts.maxWaitForFcp;
  let config;
  if (opts.desktop) {
    const cfg = require('lighthouse/core/config/desktop-config.js');
    config = cfg.default || cfg;
  }
  try {
    const result = await lighthouse(url, flags, config);
    return result.lhr;
  } catch (err) {
    return {
      requestedUrl: url,
      runtimeError: { code: 'LIGHTHOUSE_EXCEPTION', message: err.message || String(err) },
    };
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const urls = opts.urls.map(normalizeUrl);
  const multi = urls.length > 1;

  if (multi && (opts.json || opts.html)) {
    console.error('note: --json/--html are ignored for multi-URL runs; per-site reports are saved to reports/ instead (use --no-save to skip)');
  }

  const chromeFlags = ['--headless=new', '--no-sandbox', '--disable-gpu'];
  if (opts.direct) chromeFlags.push('--no-proxy-server');
  chromeFlags.push(...opts.chromeFlags.filter(Boolean));
  const chrome = await chromeLauncher.launch({ chromeFlags, channel: opts.channel || undefined });

  const rows = [];
  let anyError = false;
  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const { lhr, runs } = await auditWithRuns(url, opts, chrome.port);
      const row = summarize(lhr, url);
      row.runs = runs.length;
      rows.push(row);
      const saved = saveReports(lhr, url, opts);

      const runsLine = runs.length > 1
        ? `  [median of ${runs.length}: ${runs.map(h => Math.round(perfScore(h) * 100)).join(', ')}]`
        : '';

      if (!multi) {
        if (!row.ok) {
          console.error('');
          console.error(`FAILED TO LOAD: ${row.error}`);
          console.error(row.detail);
          if (saved.json) console.error(`Raw Lighthouse result: ${saved.json}`);
          anyError = true;
        } else {
          printDetailed(lhr, opts);
          if (runsLine) console.log(runsLine.trim());
          if (saved.json) console.log(`JSON report: ${saved.json}`);
          if (saved.html) console.log(`HTML report: ${saved.html}`);
          console.log('');
        }
      } else {
        if (row.ok) {
          console.log(`[${i + 1}/${urls.length}] ${String(Math.round(row.score * 100)).padEnd(4)} ${row.url}  (LCP ${fmtMs(row.lcp)}, CLS ${row.cls == null ? 'n/a' : row.cls.toFixed(3)})${runsLine}`);
        } else {
          anyError = true;
          console.log(`[${i + 1}/${urls.length}] ERR  ${row.url}  -> ${row.error}`);
        }
      }
    }
  } finally {
    await chrome.kill();
  }

  if (multi) {
    printSummaryTable(rows);
    console.log(`Summary: ${rows.filter(r => r.ok).length} audited, ${rows.filter(r => !r.ok).length} failed`);
  }
  if (opts.csv) {
    writeCsv(rows, opts.csv);
    console.log(`CSV report: ${opts.csv}`);
  }
  if (multi) console.log('');

  process.exit(anyError ? 2 : 0);
}

main().catch(err => {
  console.error('speedcheck failed:', err.message || err);
  process.exit(2);
});
