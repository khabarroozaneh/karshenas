#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const chromeLauncher = require('chrome-launcher');
const lhModule = require('lighthouse');
const lighthouse = lhModule.lighthouse || lhModule.default || lhModule;

const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 8787;
const REPORTS = path.join(__dirname, 'reports');
fs.mkdirSync(REPORTS, { recursive: true });

const job = {
  running: false, total: 0, index: 0, rows: [], message: '', startedAt: null, finishedAt: null,
};

function normalizeUrl(u) {
  return /^https?:\/\//i.test(u) ? u : 'http://' + u;
}

function metricValue(lhr, id) {
  const a = lhr.audits && lhr.audits[id];
  return a && a.numericValue != null ? a.numericValue : null;
}

function gradeOf(score) {
  if (score == null) return 'FAILED';
  const p = Math.round(score * 100);
  if (p >= 90) return 'GOOD';
  if (p >= 50) return 'NEEDS WORK';
  return 'POOR';
}

function summarize(lhr, url, via, reportFile) {
  if (!lhr || lhr.runtimeError) {
    return {
      url, ok: false, score: null, grade: 'FAILED', via,
      error: (lhr && lhr.runtimeError && lhr.runtimeError.code) || 'UNKNOWN',
      detail: (lhr && lhr.runtimeError && lhr.runtimeError.message) || '',
      fcp: null, lcp: null, cls: null, tbt: null, si: null, ttfb: null, report: null, at: new Date().toISOString(),
    };
  }
  const perf = lhr.categories.performance;
  const score = perf ? perf.score : null;
  return {
    url: lhr.finalDisplayedUrl || lhr.requestedUrl || url,
    ok: true, score, grade: gradeOf(score), via,
    error: null, detail: null,
    fcp: metricValue(lhr, 'first-contentful-paint'),
    lcp: metricValue(lhr, 'largest-contentful-paint'),
    cls: metricValue(lhr, 'cumulative-layout-shift'),
    tbt: metricValue(lhr, 'total-blocking-time'),
    si: metricValue(lhr, 'speed-index'),
    ttfb: metricValue(lhr, 'server-response-time'),
    report: reportFile, at: new Date().toISOString(),
  };
}

async function runLighthouse(channel, extraFlags, target, maxWaitForFcp) {
  const chromeFlags = ['--headless=new', '--no-sandbox', '--disable-gpu', ...extraFlags];
  const chrome = await chromeLauncher.launch({ chromeFlags, channel });
  try {
    const flags = { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: ['performance'] };
    if (maxWaitForFcp) flags.maxWaitForFcp = maxWaitForFcp;
    const result = await lighthouse(target, flags, undefined);
    return result.lhr;
  } finally {
    await chrome.kill();
  }
}

function saveReport(lhr, url) {
  if (!lhr || lhr.runtimeError) return null;
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const host = (lhr.finalDisplayedUrl || url).replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/gi, '_');
    const jsonPath = path.join(REPORTS, `${host}-${stamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(lhr, null, 2));
    const rg = require('lighthouse/report/generator/report-generator.js');
    const generateReport = rg.generateReport || (rg.ReportGenerator && rg.ReportGenerator.generateReport);
    const htmlPath = path.join(REPORTS, `${host}-${stamp}.html`);
    fs.writeFileSync(htmlPath, generateReport(lhr, 'html'));
    return path.basename(htmlPath);
  } catch (e) {
    return null;
  }
}

// Strategy proven on this machine: Chrome first, then Edge with a direct
// connection (that is what gets through strict WAFs like artmoein.ir).
async function auditUrl(rawUrl) {
  const target = normalizeUrl(rawUrl);
  const attempts = [
    { name: 'chrome', run: () => runLighthouse(undefined, [], target, 30000) },
    { name: 'edge-direct', run: () => runLighthouse('msedge', ['--no-proxy-server'], target, 180000) },
  ];
  let lastLhr = null;
  for (const a of attempts) {
    let lhr = null;
    try {
      lhr = await a.run();
    } catch (e) {
      lhr = { requestedUrl: target, runtimeError: { code: 'EXCEPTION', message: e.message || String(e) } };
    }
    if (lhr && !lhr.runtimeError) {
      const file = saveReport(lhr, target);
      return summarize(lhr, target, a.name, file);
    }
    lastLhr = lhr;
  }
  return summarize(lastLhr, target, 'failed', null);
}

async function runJob(urls) {
  job.running = true;
  job.total = urls.length;
  job.index = 0;
  job.rows = [];
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.message = 'شروع شد';
  try {
    for (let i = 0; i < urls.length; i++) {
      job.index = i + 1;
      job.message = `در حال تست ${i + 1} از ${urls.length}: ${urls[i]}`;
      const row = await auditUrl(urls[i]);
      job.rows.push(row);
    }
    job.message = 'تمام شد';
  } catch (e) {
    job.message = 'خطا: ' + (e.message || e);
  } finally {
    job.running = false;
    job.finishedAt = new Date().toISOString();
  }
}

function toCsv(rows) {
  const header = ['url', 'score', 'grade', 'fcp_ms', 'lcp_ms', 'cls', 'tbt_ms', 'speed_index_ms', 'ttfb_ms', 'error'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push([
      JSON.stringify(r.url),
      r.ok && r.score != null ? Math.round(r.score * 100) : '',
      r.grade,
      r.fcp == null ? '' : Math.round(r.fcp),
      r.lcp == null ? '' : Math.round(r.lcp),
      r.cls == null ? '' : r.cls.toFixed(3),
      r.tbt == null ? '' : Math.round(r.tbt),
      r.si == null ? '' : Math.round(r.si),
      r.ttfb == null ? '' : Math.round(r.ttfb),
      r.error ? JSON.stringify(r.error) : '',
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

const PAGE = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>آزمایشگاه سرعت سایت</title>
<style>
  :root { --bg:#0f172a; --card:#1e293b; --line:#334155; --txt:#e2e8f0; --mut:#94a3b8; --acc:#38bdf8; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: Tahoma, "Segoe UI", sans-serif; background:var(--bg); color:var(--txt); }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px 60px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: var(--mut); font-size: 13px; margin-bottom: 18px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  textarea { width:100%; min-height: 140px; background:#0b1220; color:var(--txt); border:1px solid var(--line);
             border-radius: 8px; padding: 12px; font-family: Consolas, monospace; font-size: 14px; direction:ltr; text-align:left; }
  .row { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top: 12px; }
  button { background:var(--acc); color:#06283d; border:0; border-radius: 8px; padding: 10px 22px; font-size: 15px; font-weight:bold; cursor:pointer; }
  button:disabled { opacity:.45; cursor: default; }
  button.ghost { background:#334155; color:var(--txt); font-weight:normal; }
  .status { color:var(--mut); font-size: 14px; }
  .bar { height: 8px; background:#0b1220; border-radius: 6px; overflow:hidden; margin-top: 10px; }
  .bar i { display:block; height:100%; background:var(--acc); width:0; transition: width .4s; }
  table { width:100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 9px 8px; border-bottom: 1px solid var(--line); text-align: center; }
  th { color: var(--mut); font-weight: normal; font-size: 12px; }
  td.url { text-align: left; direction: ltr; font-family: Consolas, monospace; font-size: 12.5px; word-break: break-all; }
  .pill { padding: 3px 9px; border-radius: 999px; font-size: 12px; font-weight: bold; }
  .GOOD { background:#14532d; color:#86efac; }
  .NEEDS { background:#713f12; color:#fde68a; }
  .POOR { background:#7f1d1d; color:#fecaca; }
  .FAILED { background:#3f3f46; color:#d4d4d8; }
  .score { font-size: 17px; font-weight: bold; }
  a.report { color:var(--acc); text-decoration: none; }
  .hint { color:var(--mut); font-size: 12.5px; margin-top: 8px; }
</style>
</head>
<body>
<div class="wrap">
  <h1>آزمایشگاه سرعت سایت</h1>
  <div class="sub">بدون API گوگل — همان موتور PageSpeed Insights (Lighthouse 13.5) روی همین کامپیوتر</div>

  <div class="card">
    <textarea id="urls" placeholder="https://client1.ir&#10;https://client2.ir&#10;https://client3.ir"></textarea>
    <div class="row">
      <button id="start" onclick="startRun()">شروع تست</button>
      <button id="csv" class="ghost" onclick="downloadCsv()" style="display:none">دانلود جدول CSV</button>
      <span id="status" class="status">آدرس‌ها را هر کدام در یک خط بگذارید.</span>
    </div>
    <div class="bar"><i id="bar"></i></div>
    <div class="hint">هر سایت بین ۲۰ تا ۶۰ ثانیه طول می‌کشد. اگر سایتی جواب نداد، ابتکار دوم (Edge + اتصال مستقیم) هم به‌صورت خودکار امتحان می‌شود.</div>
  </div>

  <div class="card" id="resultCard" style="display:none">
    <table>
      <thead>
        <tr>
          <th style="width:70px">نمره</th>
          <th style="width:110px">وضعیت</th>
          <th>LCP</th><th>FCP</th><th>CLS</th><th>TBT</th>
          <th style="text-align:left">سایت</th>
          <th style="width:80px">گزارش</th>
        </tr>
      </thead>
      <tbody id="tbody"></tbody>
    </table>
    <div class="hint">جدول از بدترین سایت به بهترین مرتب است — ابتدای جدول یعنی بهترین سرنخ فروش.</div>
  </div>
</div>

<script>
let timer = null;

function fmtMs(ms) {
  if (ms == null) return '-';
  return ms >= 1000 ? (ms/1000).toFixed(2) + ' s' : Math.round(ms) + ' ms';
}
function pill(grade) {
  const map = { 'GOOD':'GOOD', 'NEEDS WORK':'NEEDS', 'POOR':'POOR', 'FAILED':'FAILED' };
  return '<span class="pill ' + (map[grade]||'FAILED') + '">' + grade + '</span>';
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function render(rows, total, index, running, message) {
  if (!rows.length) return;
  document.getElementById('resultCard').style.display = 'block';
  const sorted = rows.slice().sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? 1 : -1;
    const as = a.score == null ? -1 : a.score, bs = b.score == null ? -1 : b.score;
    return as - bs;
  });
  document.getElementById('tbody').innerHTML = sorted.map(r => {
    const link = r.report ? '<a class="report" target="_blank" href="/reports/' + encodeURIComponent(r.report) + '">HTML</a>' : (r.error ? '<span title="' + esc(r.detail||'') + '">' + esc(r.error) + '</span>' : '-');
    return '<tr>' +
      '<td class="score">' + (r.ok && r.score != null ? Math.round(r.score*100) : '-') + '</td>' +
      '<td>' + pill(r.grade) + '</td>' +
      '<td>' + fmtMs(r.lcp) + '</td>' +
      '<td>' + fmtMs(r.fcp) + '</td>' +
      '<td>' + (r.cls == null ? '-' : r.cls.toFixed(3)) + '</td>' +
      '<td>' + fmtMs(r.tbt) + '</td>' +
      '<td class="url">' + esc(r.url) + '</td>' +
      '<td>' + link + '</td>' +
    '</tr>';
  }).join('');
}

async function poll() {
  try {
    const res = await fetch('/api/status');
    const s = await res.json();
    document.getElementById('status').textContent = s.message || '';
    const pct = s.total ? Math.round((s.index / s.total) * 100) : 0;
    document.getElementById('bar').style.width = pct + '%';
    document.getElementById('csv').style.display = s.rows.length ? 'inline-block' : 'none';
    render(s.rows, s.total, s.index, s.running, s.message);
    if (!s.running && timer) { clearInterval(timer); timer = null; document.getElementById('start').disabled = false; }
  } catch (e) { /* server restarting; keep polling */ }
}

async function startRun() {
  const urls = document.getElementById('urls').value.split(/\\r?\\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  if (!urls.length) { alert('اول آدرس سایت را بنویسید (هر خط یک آدرس)'); return; }
  document.getElementById('start').disabled = true;
  const res = await fetch('/api/run', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({urls}) });
  if (res.status === 409) { alert('یک تست دیگر هنوز در حال اجراست'); document.getElementById('start').disabled = false; return; }
  if (!res.ok) { alert('خطا در شروع'); document.getElementById('start').disabled = false; return; }
  if (!timer) timer = setInterval(poll, 1000);
  poll();
}

function downloadCsv() { window.location = '/api/csv'; }

poll();
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(PAGE);
  }

  if (req.method === 'GET' && u.pathname === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      running: job.running, total: job.total, index: job.index,
      rows: job.rows, message: job.message,
    }));
  }

  if (req.method === 'POST' && u.pathname === '/api/run') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 500000) req.destroy(); });
    req.on('end', () => {
      if (job.running) { res.writeHead(409); return res.end('busy'); }
      let urls = [];
      try { urls = (JSON.parse(body).urls || []).map(normalizeUrl).filter(Boolean); } catch (e) {}
      if (!urls.length) { res.writeHead(400); return res.end('no urls'); }
      runJob(urls);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ started: urls.length }));
    });
    return;
  }

  if (req.method === 'GET' && u.pathname === '/api/csv') {
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="speed-results.csv"' });
    return res.end(toCsv(job.rows));
  }

  if (req.method === 'GET' && u.pathname.startsWith('/reports/')) {
    const file = path.basename(decodeURIComponent(u.pathname.slice('/reports/'.length)));
    const full = path.join(REPORTS, file);
    if (fs.existsSync(full) && full.startsWith(REPORTS)) {
      res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/json' });
      return res.end(fs.readFileSync(full));
    }
    res.writeHead(404); return res.end('not found');
  }

  res.writeHead(404); res.end('not found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Speed lab is running: http://localhost:${PORT}`);
});
