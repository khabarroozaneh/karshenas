# -*- coding: utf-8 -*-
"""
خط لوله تولید لید وردپرسی — از بانک اکسل تا خوراک پنل منشی
================================================================
مرحله ۱: تشخیص سایت‌های وردپرسی (RAVAND/1/Robat/detector.py)
مرحله ۲: تست سرعت فقط وردپرسی‌های تأییدشده (RAVAND/2/TEST_SORAT/cli.js)
خروجی : فید JSON پنل منشی با افزونه‌ها + معیارهای سرعت + مشکلات به زبان ساده

ساختار اکسل بانک (فایل نمونه: RAVAND/1/DATA/1-235.xlsx):
    ستون A = نام سایت / کسب‌وکار   -> name
    ستون B = تلفن                  -> phone
    ستون C = نام صاحب سایت         -> ownerName
    ستون D = آدرس سایت             -> url
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime

import openpyxl

BASE = os.path.dirname(os.path.abspath(__file__))
ROBOT_DIR = os.path.join(BASE, "..", "1", "Robat")
SORAT_DIR = os.path.join(BASE, "..", "2", "TEST_SORAT")
OUTPUT_DIR = os.path.join(BASE, "OUTPUT")

sys.path.insert(0, os.path.abspath(ROBOT_DIR))
from detector import WordPressDetector  # noqa: E402

# فیلدهای اجباری پنل منشی — بدون هر چهار فیلد، لید رد می‌شود
REQUIRED_KEYS = {
    "ownerName": ("ownerName", "owner"),
    "name": ("name", "title"),
    "url": ("url", "website", "domain", "link"),
    "phone": ("phone", "mobile", "tel"),
}


def log(msg):
    print(f"[خط لوله] {msg}", flush=True)


# ارقام انگلیسی داخل متن فارسی نامناسب است؛ همه‌جا میلادی به شمسی تبدیل می‌شود
FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def fa(value):
    """نمایش فارسی اعداد (۸۰.۰ -> ۸۰)."""
    s = f"{value:g}" if isinstance(value, float) else str(value)
    return s.translate(FA_DIGITS)


# ---------------------------------------------------------------- اکسل ----
def read_bank(path):
    """بانک اکسل را می‌خواند و لیست لیدهای خام برمی‌گرداند.

    ردیف اول هدر است. ستون‌ها طبق قرارداد بالا نگاشت می‌شوند.
    ردیف‌هایی که هیچ آدرس سایتی ندارند رد می‌شوند.
    """
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = []
    for row in ws.iter_rows(values_only=True):
        cells = [(("" if c is None else str(c).strip())) for c in row]
        # حداقل ۴ ستون لازم است
        while len(cells) < 4:
            cells.append("")
        lead = {
            "name": cells[0],
            "phone": cells[1],
            "ownerName": cells[2],
            "url": cells[3],
        }
        if not lead["url"]:
            continue
        rows.append(lead)
    wb.close()
    # حذف ردیف هدر اگر مقادیرش شبیه نام ستون‌هاست
    if rows and rows[0]["url"].lower().rstrip("/") in ("url", "آدرس", "site", "website"):
        rows = rows[1:]
    return rows


# ------------------------------------------------------- مرحله ۱ ----
# دسته‌بندی فناوری‌ها برای ارائه به زبان ساده به کارشناس
CATEGORY_FA = {
    "E-Commerce": "فروشگاه آنلاین",
    "Page Builder": "سازنده صفحه",
    "SEO Plugin": "افزونه سئو",
    "Form Plugin": "افزونه فرم تماس",
    "Multilingual": "چندزبانه",
    "Plugin Suite": "مجموعه افزونه",
    "Caching": "کش (سرعت)",
    "JS Library": "کتابخانه جاوااسکریپت",
    "CSS Framework": "چارچوب CSS",
    "Icons": "آیکون",
    "Analytics": "تحلیل بازدید",
    "CDN / Security": "شبکه توزیع / امنیت",
    "Web Server": "وب سرور",
    "Server Technology": "تکنولوژی سرور",
    "CMS / Builder": "سیستم مدیریت محتوا",
}


def extract_plugins(detected):
    """فناوری‌های کشف‌شده را به دو لیست تبدیل می‌کند:
    افزونه‌های وردپرسی (برای کارشناس) و توضیح سادهٔ هر کدام.
    """
    if not detected:
        return [], []
    plugins = []
    descriptions = []
    for tech, cat in detected.items():
        # کلیدهای سرور/هدر جزء افزونه‌ها حساب نمی‌شوند
        if tech.startswith(("Server:", "Powered By:", "Generator:")):
            continue
        plugins.append(tech)
        fa_cat = CATEGORY_FA.get(cat, cat)
        descriptions.append(f"{tech} ({fa_cat})")
    return plugins, descriptions


def run_stage1(leads, max_workers=8):
    """مرحله ۱: تشخیص وردپرس روی همهٔ آدرس‌ها.

    فقط وردپرسی‌های تأییدشده وارد مرحله ۲ می‌شوند.
    """
    log(f"مرحله ۱: تشخیص وردپرس روی {len(leads)} سایت ...")
    detector = WordPressDetector(timeout=30, max_workers=max_workers, max_retries=2)

    done = {"n": 0}

    def progress(result):
        done["n"] += 1
        status = result.get("status")
        mark = {"wordpress": "✅", "not_wordpress": "❌",
                "blocked": "🧱", "error": "⚠️"}.get(status, "?")
        if done["n"] % 10 == 0 or done["n"] == len(leads):
            log(f"  مرحله ۱: {done['n']}/{len(leads)} بررسی شد")
        else:
            print(f"  {mark} {result.get('url', '?')} -> {status}", flush=True)

    results = detector.check_all([lead["url"] for lead in leads], callback=progress)

    wp_by_url = {}
    for site in results["wordpress"]:
        wp_by_url[normalize_url_key(site["url"])] = site

    log((f"مرحله ۱ تمام شد: {len(results['wordpress'])} وردپرسی، "
         f"{len(results['not_wordpress'])} غیروردپرس، "
         f"{len(results.get('blocked', []))} مسدودشده، "
         f"{len(results['errors'])} خطا"))
    return results, wp_by_url


def normalize_url_key(url):
    """کلید یکتا برای تطبیق نتیجهٔ ربات با ردیف اکسل."""
    u = (url or "").strip().lower()
    u = re.sub(r"^https?://", "", u)
    u = re.sub(r"^www\.", "", u)
    u = u.rstrip("/")
    return u


# ------------------------------------------------------- مرحله ۲ ----
# کش نتایج Lighthouse: اجرای دوبارهٔ خط لوله، سایت‌های تست‌شده را دوباره
# تست نمی‌کند. این فایل در OUTPUT نگه داشته می‌شود.
SPEED_CACHE = os.path.join(OUTPUT_DIR, "speed_cache.json")
STAGE1_CACHE = os.path.join(OUTPUT_DIR, "pipeline_report.json")


def load_speed_cache():
    try:
        with open(SPEED_CACHE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def save_speed_cache(cache):
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(SPEED_CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def load_stage1_cache():
    """نتایج مرحلهٔ ۱ از آخرین اجرای کامل را می‌خواند.

    برای پرچم --cached-only استفاده می‌شود تا بدون اجرای دوبارهٔ
    ربات تشخیص، فید بازسازی شود.
    """
    try:
        with open(STAGE1_CACHE, "r", encoding="utf-8") as f:
            rep = json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}
    wp_by_url = {}
    for site in rep.get("stage1", {}).get("wordpress", []):
        if isinstance(site, dict) and site.get("url"):
            wp_by_url[normalize_url_key(site["url"])] = site
    return wp_by_url


METRIC_LABELS_FA = {
    "fcp": "زمان ظاهر شدن اولین محتوا",
    "lcp": "زمان بارگذاری اصلی‌ترین محتوا",
    "cls": "جابجایی ناگهانی صفحه",
    "tbt": "قفل موقت صفحه هنگام باز شدن",
    "si": "سرعت نمایش کامل صفحه",
    "ttfb": "سرعت پاسخ سرور",
}


def run_speed_test(url, node_cmd="node"):
    """تست سرعت یک سایت با cli.js (Lighthouse محلی).

    خروجی JSON خام Lighthouse در یک فایل موقت نوشته و بعد پارس می‌شود.
    «edge + اتصال مستقیم» به‌عنوان ابتکار دوم امتحان می‌شود چون روی
    سایت‌های با فایروال سختگیرانه جواب می‌دهد.
    """
    cli = os.path.join(SORAT_DIR, "cli.js")
    if not os.path.exists(cli):
        return {"ok": False, "error": "cli.js پیدا نشد", "via": None}

    fd, tmp = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    try:
        # هر سایت N بار تست می‌شود و میانهٔ نتایج استفاده می‌شود (دقت بالا).
        # سایت‌های تست‌شده در کش با همان دقت قبلی نگه داشته می‌شوند.
        RUNS_FLAGS = ["--runs", os.environ.get("WPJOO_RUNS", "1"), "--retry", "1"]
        attempts = [
            {"name": "chrome", "cmd": [node_cmd, cli, url, "--json", tmp, "--no-save",
                                           *RUNS_FLAGS,
                                           "--max-wait-fcp", "30000"]},
            {"name": "edge-direct", "cmd": [node_cmd, cli, url, "--json", tmp, "--no-save",
                                                  "--browser", "edge", "--direct",
                                                  *RUNS_FLAGS,
                                                  "--max-wait-fcp", "180000"]},
        ]
        last_error = "unknown"
        for attempt in attempts:
            try:
                proc = subprocess.run(
                    attempt["cmd"], capture_output=True, text=True,
                    cwd=SORAT_DIR, timeout=1000,
                )
            except subprocess.TimeoutExpired:
                last_error = "timeout-running-lighthouse"
                continue
            if proc.returncode != 0:
                last_error = (proc.stderr or proc.stdout or "").strip()[:200]
                continue
            data = parse_lighthouse(tmp, url)
            if data["ok"]:
                data["via"] = attempt["name"]
                return data
            last_error = data.get("error") or last_error
        return {"ok": False, "error": last_error, "via": None}
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass


def parse_lighthouse(path, url):
    """معیارهای کارایی و فرصت‌های بهبود را از خروجی Lighthouse برمی‌داند."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            lhr = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        return {"ok": False, "error": f"bad-json: {exc}"}

    if lhr.get("runtimeError"):
        return {"ok": False,
                "error": lhr["runtimeError"].get("code", "runtime-error")}

    def metric(audit_id):
        a = lhr.get("audits", {}).get(audit_id)
        if a and a.get("numericValue") is not None:
            return a["numericValue"]
        return None

    perf = lhr.get("categories", {}).get("performance", {})
    score = perf.get("score")

    opportunities = []
    for audit in lhr.get("audits", {}).values():
        details = audit.get("details") or {}
        if details.get("type") != "opportunity":
            continue
        ms = details.get("overallSavingsMs") or 0
        kb = details.get("overallSavingsBytes") or 0
        if ms < 200 and kb < 2048:
            continue
        if audit.get("score") is not None and audit["score"] >= 0.9:
            continue
        opportunities.append({
            "id": audit.get("id", ""),
            "title": audit.get("title", ""),
            "ms": round(ms),
            "kb": round(kb / 1024, 1),
            "display": audit.get("displayValue", ""),
        })
    opportunities.sort(key=lambda o: o["ms"], reverse=True)

    # اگر cli.js چند بار اجرا کرده باشد، گزارش «میانه» است؛
    # تعداد اجراها و نمرهٔ هر اجرا برای شفافیت ذخیره می‌شود.
    runs = lhr.get("medianOfRuns") or 1
    run_scores = [r.get("score") for r in (lhr.get("runDetails") or [])
                  if isinstance(r, dict) and r.get("score") is not None]

    return {
        "ok": True,
        "url": lhr.get("finalDisplayedUrl") or lhr.get("requestedUrl") or url,
        "score": round(score * 100) if score is not None else None,
        "runs": runs,
        "runScores": run_scores,
        "fcp": metric("first-contentful-paint"),
        "lcp": metric("largest-contentful-paint"),
        "cls": metric("cumulative-layout-shift"),
        "tbt": metric("total-blocking-time"),
        "si": metric("speed-index"),
        "ttfb": metric("server-response-time"),
        "opportunities": opportunities[:8],
    }


# ------------------------------------------------- زبان ساده ----
def fmt_ms(ms):
    """میلی‌ثانیه را به فارسی قابل‌فهم تبدیل می‌کند."""
    if ms is None:
        return None
    if ms >= 1000:
        return fa(round(ms / 1000, 1)) + " ثانیه"
    return fa(round(ms)) + " میلی‌ثانیه"


def grade_fa(score):
    if score is None:
        return "نامشخص"
    if score >= 90:
        return "عالی"
    if score >= 50:
        return "نیازمند بهبود"
    return "ضعیف"


# نگاشت فرصت‌های Lighthouse به توضیح ساده برای کارشناس فروش
OPPORTUNITY_FA = {
    "render-blocking-resources": "فایل‌های CSS و جاوااسکریپت که باز شدن صفحه را به تأخیر می‌اندازند",
    "uses-responsive-images": "تصاویری که برای موبایل کوچک نشده‌اند و حجم اضافی دارند",
    "uses-optimized-images": "تصاویری که فشرده نشده‌اند و صفحه را کند می‌کنند",
    "modern-image-formats": "تصاویر با فرمت قدیمی (به جای WebP) که حجمشان بیشتر است",
    "unused-javascript": "کدهای جاوااسکریپت بلااستفاده که بارگذاری را سنگین می‌کنند",
    "unused-css-rules": "کدهای CSS بلااستفاده در قالب یا افزونه‌ها",
    "uses-text-compression": "صفحه فشرده‌سازی (Gzip/Brotli) روی سرور فعال نیست",
    "uses-long-cache-ttl": "هدرهای کش طولانی‌مدت روی فایل‌های استاتیک تنظیم نشده‌اند",
    "legacy-javascript": "کدهای قدیمی جاوااسکریپت که روی مرورگرهای جدید کند هستند",
    "total-byte-weight": "حجم کلی صفحه خیلی زیاد است",
    "dom-size": "ساختار صفحه (DOM) بیش از حد بزرگ است",
    "efficient-animated-content": "فایل‌های انیمیشن سنگین به جای ویدیوی سبک",
    "bootup-time": "زیاد بودن محاسبات جاوااسکریپت هنگام باز شدن صفحه",
    "mainthread-work-breakdown": "پردازش‌های سنگین روی رشته اصلی مرورگر",
    # این موارد لایت‌هاوس آن‌ها را به‌عنوان «فرصت» هم برچسب می‌زند
    "server-response-time": "کند بودن پاسخ اولیهٔ سرور (TTFB)",
    "redirects": "انتقال‌های چندمرحله‌ای (ردایرکت) که زمان بارگذاری را هدر می‌دهند",
    "font-display": "فونت‌های وب که تا بارگذاری کامل متن را نامرئی می‌کنند",
}


def build_issues(speed, plugins):
    """مشکلات سایت را به زبان ساده برای کارشناس می‌سازد.

    ورودی: معیارهای Lighthouse + لیست افزونه‌ها
    خروجی: لیست جملات فارسی ساده که کارشناس موقع تماس می‌خواند
    """
    issues = []
    if not speed or not speed.get("ok"):
        return issues

    score = speed.get("score")
    if score is not None:
        issues.append(f"نمره سرعت سایت {fa(score)} از ۱۰۰ است ({grade_fa(score)}).")

    # --- معیارهای اصلی با آستانهٔ مشخص ---
    lcp = speed.get("lcp")
    if lcp is not None:
        if lcp >= 4000:
            issues.append(
                f"بارگذاری اصلی‌ترین محتوای صفحه {fmt_ms(lcp)} طول می‌کشد؛ "
                f"بسیار کند است و مشتری احتمالاً بازدیدکننده را از دست می‌دهد.")
        elif lcp >= 2500:
            issues.append(
                f"بارگذاری اصلی‌ترین محتوای صفحه {fmt_ms(lcp)} طول می‌کشد؛ "
                f"کند است و جای بهبود دارد.")

    fcp = speed.get("fcp")
    if fcp is not None and fcp >= 1800:
        issues.append(
            f"اولین محتوای صفحه بعد از {fmt_ms(fcp)} ظاهر می‌شود؛ "
            f"کاربر در ابتدا صفحهٔ خالی می‌بیند.")

    cls = speed.get("cls")
    if cls is not None and cls >= 0.25:
        issues.append(
            "محتوای صفحه هنگام باز شدن جابه‌جا می‌شود و کاربر روی جای اشتباه "
            "کلیک می‌کند (مشکل تجربهٔ کاربری موبایل).")

    tbt = speed.get("tbt")
    if tbt is not None and tbt >= 600:
        issues.append(
            f"صفحه هنگام باز شدن به مدت {fmt_ms(tbt)} قفل می‌شود و "
            f"غیرقابل اسکرول است.")

    ttfb = speed.get("ttfb")
    if ttfb is not None and ttfb >= 800:
        issues.append(
            f"سرور سایت {fmt_ms(ttfb)} طول می‌کشد تا اولین پاسخ را بدهد؛ "
            f"معمولاً یعنی هاست ضعیف یا کش فعال نیست.")

    # --- فرصت‌های Lighthouse به زبان ساده ---
    seen_opp = set()
    for opp in speed.get("opportunities", [])[:5]:
        fa_text = OPPORTUNITY_FA.get(opp.get("id", ""), "")
        if not fa_text:
            # تطبیق با عنوان انگلیسی اگر id در فرصت نبود
            title = (opp.get("title") or "").replace(" ", "-").lower()
            for key, val in OPPORTUNITY_FA.items():
                if key.split("-")[0] in title:
                    fa_text = val
                    break
        if not fa_text or fa_text in seen_opp:
            continue
        seen_opp.add(fa_text)
        ms = opp.get("ms") or 0
        kb = opp.get("kb") or 0
        if ms >= 200:
            issues.append(f"{fa_text} (صرفه‌جویی حدود {fmt_ms(ms)}).")
        elif kb >= 200:
            issues.append(f"{fa_text} (کاهش حدود {fa(kb)} کیلوبایت از حجم صفحه).")
        else:
            issues.append(f"{fa_text}.")

    # --- بینش از افزونه‌های نصب‌شده ---
    if plugins:
        caching = [p for p in plugins
                   if any(k in p.lower() for k in ("litespeed", "wp rocket", "cache"))]
        if not caching:
            issues.append(
                "افزونهٔ کش حرفه‌ای روی سایت نصب به نظر نمی‌رسد؛ بدون کش، "
                "هر بازدید سرور را مجبور به ساخت دوبارهٔ صفحه می‌کند.")
        heavy = [p for p in plugins if p in ("Elementor", "Divi Builder",
                                             "WPBakery", "WooCommerce")]
        if heavy:
            issues.append(
                "سایت از " + " و ".join(heavy) + " استفاده می‌کند؛ این ابزارها "
                "صفحه را سنگین می‌کنند و بدون تنظیمات بهینه‌سازی کند می‌شوند.")

    # حذف تکرارها
    seen, unique = set(), []
    for item in issues:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


# ------------------------------------------------- ساخت فید ----
def build_feed(leads, wp_by_url, speed_by_url, run_stage2_flag):
    """خوراک نهایی پنل منشی را می‌سازد.

    هر لید شامل:
      - چهار فیلد اجباری (ownerName / name / url / phone)
      - plugins:        افزونه‌های نصب‌شده (برای پنل کارشناس)
      - pluginsFa:      توضیح سادهٔ هر افزونه
      - speed:          معیارهای Lighthouse خام
      - issues:         مشکلات به زبان ساده (برای کارشناس موقع تماس)
      - wordpressFacts: اطلاعات تشخیص وردپرس

    فقط وردپرسی‌های تأییدشده وارد فید می‌شوند.
    """
    feed, skipped = [], []
    for lead in leads:
        key = normalize_url_key(lead["url"])
        site = wp_by_url.get(key)
        if not site:
            skipped.append({**lead,
                            "reason": "wordpress-confirmed-false"})
            continue

        plugins, plugins_fa = extract_plugins(site.get("technologies", {}))
        speed = speed_by_url.get(key) if run_stage2_flag else None
        issues = build_issues(speed, plugins)

        item = {
            # --- فیلدهای اجباری پنل منشی ---
            "ownerName": lead["ownerName"] or lead["name"],
            "name": lead["name"],
            "url": lead["url"],
            "phone": lead["phone"],
            # --- داده‌های پنل کارشناس (منشی استفاده نمی‌کند) ---
            "plugins": plugins,
            "pluginsFa": plugins_fa,
            "issues": issues,
            "wordpressFacts": {
                "detectedBy": site.get("methods", []),
                "finalUrl": site.get("final_url"),
                "pageTitle": site.get("page_title"),
                "blocked": bool(site.get("blocked")),
                "responseTimeMs": site.get("response_time_ms"),
                "techCount": site.get("tech_count", 0),
            },
        }
        if speed and speed.get("ok"):
            item["speed"] = {
                "score": speed.get("score"),
                "grade": grade_fa(speed.get("score")),
                "runs": speed.get("runs") or 1,
                "runScores": speed.get("runScores") or [],
                "fcp": speed.get("fcp"),
                "lcp": speed.get("lcp"),
                "cls": speed.get("cls"),
                "tbt": speed.get("tbt"),
                "si": speed.get("si"),
                "ttfb": speed.get("ttfb"),
                "testedVia": speed.get("via"),
                # فرصت‌های خام + ترجمهٔ ساده، برای پنل کارشناس
                "opportunities": [
                    {**opp, "fa": OPPORTUNITY_FA.get(opp.get("id", ""), "")}
                    for opp in speed.get("opportunities", [])
                ],
            }
        else:
            item["speed"] = None
        feed.append(item)
    return feed, skipped


# ----------------------------------------------------- main ----
def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="خط لوله تولید لید وردپرسی از بانک اکسل")
    parser.add_argument(
        "--bank", default=os.path.join(BASE, "..", "1", "DATA", "1-235.xlsx"),
        help="مسیر فایل اکسل بانک")
    parser.add_argument(
        "--limit", type=int, default=0,
        help="فقط N ردیف اول (۰ = همه)")
    parser.add_argument(
        "--skip-speed", action="store_true",
        help="مرحلهٔ ۲ (تست سرعت) را انجام نده")
    parser.add_argument(
        "--no-cache", action="store_true",
        help="کش Lighthouse را نادیده بگیر و همه را دوباره تست کن")
    parser.add_argument(
        "--cached-only", action="store_true",
        help="فقط از کش‌ها استفاده کن؛ مرحله ۱ و ۲ زنده اجرا نمی‌شوند "
             "(بسیار سریع برای بازسازی فید)")
    parser.add_argument(
        "--workers", type=int, default=8,
        help="تعدادی همزمانی مرحلهٔ ۱")
    parser.add_argument(
        "--node", default="node", help="مسیر اجرای node")
    parser.add_argument(
        "--output", default=None,
        help="مسیر فایل خروجی (پیش‌فرض: OUTPUT/secretary_feed.json)")
    args = parser.parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # --- خواندن بانک ---
    if not os.path.exists(args.bank):
        log(f"❌ فایل بانک پیدا نشد: {args.bank}")
        sys.exit(1)
    leads = read_bank(args.bank)
    if args.limit:
        leads = leads[: args.limit]
    log(f"بانک خوانده شد: {len(leads)} ردیف")

    # --- مرحله ۱ ---
    if args.cached_only:
        # بازسازی سریع فید از نتایج ذخیره‌شدهٔ اجرای قبلی
        wp_by_url = load_stage1_cache()
        cache = load_speed_cache()
        # هر سایتی که در کش سرعت هست، قبلاً به‌عنوان وردپرس تأیید شده است
        for key in cache:
            if key not in wp_by_url:
                wp_by_url[key] = {"url": key, "technologies": {}}
        results = {"wordpress": list(wp_by_url.values()),
                   "not_wordpress": [], "blocked": [], "errors": []}
        log(f"مرحله ۱ از کش: {len(wp_by_url)} وردپرسی")
    else:
        results, wp_by_url = run_stage1(leads, max_workers=args.workers)

    # --- مرحله ۲: فقط وردپرسی‌ها ---
    speed_by_url = {}
    wp_leads = [lead for lead in leads
                if normalize_url_key(lead["url"]) in wp_by_url]
    if args.cached_only:
        speed_by_url = {k: v for k, v in load_speed_cache().items()
                        if isinstance(v, dict)}
        log(f"مرحله ۲ از کش: {sum(1 for v in speed_by_url.values() if v.get('ok'))} "
            f"نتیجهٔ تست سرعت")
    elif args.skip_speed:
        log("مرحله ۲ با پرچم --skip-speed رد شد")
    elif not wp_leads:
        log("مرحله ۲ رد شد: هیچ سایت وردپرسی‌ای پیدا نشد")
    else:
        log(f"مرحله ۲: تست سرعت روی {len(wp_leads)} سایت وردپرسی ...")
        cache = {} if (args.no_cache or args.cached_only) else load_speed_cache()
        cached_hits = 0
        for i, lead in enumerate(wp_leads, 1):
            key = normalize_url_key(lead["url"])
            hit = cache.get(key) if not (args.no_cache or args.cached_only) else None
            if hit:
                speed_by_url[key] = hit
                cached_hits += 1
                log(f"  [{i}/{len(wp_leads)}] {lead['url']} — از کش")
                continue
            log(f"  [{i}/{len(wp_leads)}] تست سرعت {lead['url']} ...")
            speed_by_url[key] = run_speed_test(lead["url"], node_cmd=args.node)
            cache[key] = speed_by_url[key]
            save_speed_cache(cache)
            status = speed_by_url[key].get("ok")
            log(f"      -> {'✅ انجام شد' if status else '⚠️ ناموفق'}")
        ok_count = sum(1 for v in speed_by_url.values() if v.get("ok"))
        log(f"مرحله ۲ تمام شد: {ok_count}/{len(wp_leads)} سایت تست شد "
            f"({cached_hits} از کش)")

    # --- ساخت فید ---
    feed, skipped = build_feed(leads, wp_by_url, speed_by_url,
                               run_stage2_flag=not args.skip_speed or args.cached_only)
    log(f"فید ساخته شد: {len(feed)} لید وردپرسی، {len(skipped)} رد شده")

    # --- نوشتن خروجی‌ها ---
    out = args.output or os.path.join(OUTPUT_DIR, "secretary_feed.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)
    log(f"✅ خوراک پنل منشی: {out}")

    detail = os.path.join(OUTPUT_DIR, "pipeline_report.json")
    # در حالت --cached-only گزارش کامل قبلی حفظ می‌شود تا داده‌های واقعی
    # مرحله ۱ از بین نرود؛ فقط فید بازسازی می‌شود
    if not args.cached_only:
        with open(detail, "w", encoding="utf-8") as f:
            json.dump({
                "runAt": datetime.now().isoformat(),
                "bank": os.path.abspath(args.bank),
                "rowsInBank": len(leads),
                "wordpress": len(results["wordpress"]),
                "notWordpress": len(results["not_wordpress"]),
                "blocked": len(results.get("blocked", [])),
                "errors": len(results["errors"]),
                "feedSize": len(feed),
                "skipped": skipped,
                "stage1": {
                    "wordpress": results["wordpress"],
                    "notWordpress": results["not_wordpress"],
                    "blocked": results.get("blocked", []),
                    "errors": results["errors"],
                },
            }, f, ensure_ascii=False, indent=2)
        log(f"گزارش کامل: {detail}")


if __name__ == "__main__":
    main()