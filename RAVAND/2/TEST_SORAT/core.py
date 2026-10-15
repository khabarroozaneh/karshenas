# -*- coding: utf-8 -*-
"""لایهٔ منطق برنامهٔ تست سرعت (بدون رابط گرافیکی).

خواندن فایل ورودی (txt/csv/xlsx)، اجرای cli.js با تکرار برای دقت بالا،
و تبدیل نتایج Lighthouse به متن فارسی قابل‌فهم.
رابط گرافیکی app.py فقط این تابع‌ها را صدا می‌زند، پس این ماژول را می‌توان
به‌تنهایی و بدون پنجره هم تست کرد.
"""

import csv
import json
import os
import re
import subprocess
import sys
import tempfile

import openpyxl

HERE = os.path.dirname(os.path.abspath(__file__))
CLI = os.path.join(HERE, "cli.js")

# ---------------------------------------------------------------- زبان ----
FA_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")


def fa(value):
    """نمایش فارسی اعداد (۸۰.۰ -> ۸۰)."""
    s = f"{value:g}" if isinstance(value, float) else str(value)
    return s.translate(FA_DIGITS)


def fmt_ms(ms):
    """میلی‌ثانیه را به فارسی قابل‌فهم تبدیل می‌کند."""
    if ms is None:
        return "نامشخص"
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


GRADE_COLOR = {
    "عالی": ("#1c8c4a", "#e6f4ec"),
    "نیازمند بهبود": ("#c98a17", "#fdf3e0"),
    "ضعیف": ("#c0392b", "#fbeae8"),
    "نامشخص": ("#6b7280", "#f1f1f1"),
}

# برچسب فارسی هر شاخص
METRIC_FA = [
    ("score", "نمره عملکرد", None),
    ("fcp", "اولین رنگ (FCP)", "ms"),
    ("lcp", "بزرگ‌ترین محتوای متنی (LCP)", "ms"),
    ("cls", "جابجایی چیدمان (CLS)", "cls"),
    ("tbt", "تأخیر مسدودکننده (TBT)", "ms"),
    ("si", "شاخص سرعت (Speed Index)", "ms"),
    ("ttfb", "پاسخ سرور (TTFB)", "ms"),
]

# نگاشت فرصت‌های Lighthouse به توضیح ساده فارسی
OPPORTUNITY_FA = {
    "render-blocking-resources": "فایل‌های CSS و جاوااسکریپت که باز شدن صفحه را به تأخیر می‌اندازند",
    "uses-responsive-images": "تصاویری که برای موبایل کوچک نشده‌اند و حجم اضافی دارند",
    "uses-optimized-images": "تصاویری که فشرده نشده‌اند و صفحه را کند می‌کنند",
    "modern-image-formats": "تصاویر با فرمت قدیمی (به جای WebP) که حجمشان بیشتر است",
    "unused-javascript": "کدهای جاوااسکریپت بلااستفاده که بارگذاری را سنگین می‌کنند",
    "unused-css-rules": "کدهای CSS بلااستفاده در قالب یا افزونه‌ها",
    "uses-text-compression": "فشرده‌سازی صفحه (Gzip/Brotli) روی سرور فعال نیست",
    "uses-long-cache-ttl": "کش طولانی‌مدت روی فایل‌های استاتیک تنظیم نشده است",
    "legacy-javascript": "کدهای قدیمی جاوااسکریپت که روی مرورگرهای جدید کند هستند",
    "total-byte-weight": "حجم کلی صفحه خیلی زیاد است",
    "dom-size": "ساختار صفحه (DOM) بیش از حد بزرگ است",
    "efficient-animated-content": "فایل‌های انیمیشن سنگین به جای ویدیوی سبک",
    "bootup-time": "زیاد بودن محاسبات جاوااسکریپت هنگام باز شدن صفحه",
    "mainthread-work-breakdown": "پردازش‌های سنگین روی رشتهٔ اصلی مرورگر",
    "server-response-time": "کند بودن پاسخ اولیهٔ سرور (TTFB)",
    "redirects": "انتقال‌های چندمرحله‌ای (ردایرکت) که زمان بارگذاری را هدر می‌دهند",
    "font-display": "فونت‌های وب که تا بارگذاری کامل متن را نامرئی می‌کنند",
}


def fa_opportunity(opp):
    """متن فارسی یک فرصت بهبود؛ اگر نگاشت نداشتیم، خود عنوان Lighthouse."""
    text = OPPORTUNITY_FA.get(opp.get("id", ""))
    if text:
        return text
    title = (opp.get("title") or "").strip()
    for key, val in OPPORTUNITY_FA.items():
        if title and title.lower().replace(" ", "-") == key:
            return val
    return title or opp.get("id", "")


# --------------------------------------------------- فایل ورودی ----
URL_RE = re.compile(r"https?://\S+|^[\w.-]+\.[a-z]{2,}(?:/\S*)?$", re.IGNORECASE)


def _looks_like_url(cell):
    s = (cell or "").strip()
    if not s or s.startswith("#"):
        return None
    if " " in s or "\n" in s:
        return None
    if "." not in s:
        return None
    if "@" in s:  # ایمیل نیست
        return None
    return s


def read_urls(path):
    """آدرس سایت‌ها را از یک فایل txt / csv / xlsx می‌خواند.

    فقط ستونی که آدرس سایت است گرفته می‌شود (اولین ستون حاوی URL).
    خروجی: لیست آدرس‌های نرمال‌شده.
    """
    ext = os.path.splitext(path)[1].lower()

    if ext == ".xlsx":
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws = wb.worksheets[0]
        urls = []
        for row in ws.iter_rows(values_only=True):
            for cell in row:
                u = _looks_like_url(cell)
                if u:
                    urls.append(u)
                    break
        wb.close()
        return [normalize_url(u) for u in urls]

    if ext == ".csv":
        urls = []
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.reader(f)
            for row in reader:
                for cell in row:
                    u = _looks_like_url(cell)
                    if u:
                        urls.append(u)
                        break
        return [normalize_url(u) for u in urls]

    # txt یا هر فایل متنی دیگر: هر خط یک آدرس
    with open(path, "r", encoding="utf-8-sig") as f:
        urls = []
        for line in f:
            u = _looks_like_url(line.strip())
            if u:
                urls.append(u)
    return [normalize_url(u) for u in urls]


def normalize_url(u):
    u = u.strip()
    if not re.match(r"^https?://", u, re.IGNORECASE):
        u = "http://" + u
    return u.rstrip("/") + "/"


# ------------------------------------------------------ اجرا ----
METRIC_AUDITS = {
    "fcp": "first-contentful-paint",
    "lcp": "largest-contentful-paint",
    "cls": "cumulative-layout-shift",
    "tbt": "total-blocking-time",
    "si": "speed-index",
    "ttfb": "server-response-time",
}


def summarize_lhr(lhr, url):
    """گزارش خام Lighthouse را به دیکشنری فارسی-پسند تبدیل می‌کند."""
    if not lhr or lhr.get("runtimeError"):
        err = (lhr or {}).get("runtimeError") or {}
        return {
            "ok": False,
            "url": url,
            "score": None,
            "grade": "نامشخص",
            "error": err.get("code", "runtime-error"),
            "detail": err.get("message", ""),
            "runs": 0,
        }

    def metric(audit_id):
        a = lhr.get("audits", {}).get(audit_id)
        if a and a.get("numericValue") is not None:
            return a["numericValue"]
        return None

    perf = lhr.get("categories", {}).get("performance", {})
    raw_score = perf.get("score")
    score = round(raw_score * 100) if raw_score is not None else None

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
            "fa": fa_opportunity(audit),
            "ms": round(ms),
            "kb": round(kb / 1024, 1),
        })
    opportunities.sort(key=lambda o: o["ms"], reverse=True)

    run_scores = []
    for r in (lhr.get("runDetails") or []):
        run_scores.append(r.get("score"))

    return {
        "ok": True,
        "url": lhr.get("finalDisplayedUrl") or lhr.get("requestedUrl") or url,
        "score": score,
        "grade": grade_fa(score),
        "fcp": metric(METRIC_AUDITS["fcp"]),
        "lcp": metric(METRIC_AUDITS["lcp"]),
        "cls": metric(METRIC_AUDITS["cls"]),
        "tbt": metric(METRIC_AUDITS["tbt"]),
        "si": metric(METRIC_AUDITS["si"]),
        "ttfb": metric(METRIC_AUDITS["ttfb"]),
        "opportunities": opportunities[:6],
        "runs": int(lhr.get("medianOfRuns") or 1),
        "runScores": run_scores,
        "lhr": lhr,
    }


def run_one(url, runs=3, browser="edge", direct=True, max_wait_fcp=180000,
            on_log=None, cwd=HERE):
    """یک سایت را با cli.js می‌سنجد و نتیجهٔ تجمیع‌شده برمی‌گرداند.

    runs: تعداد تکرار برای دقت بالا (میانهٔ نتایج استفاده می‌شود)
    """
    cmd = ["node", CLI, url,
           "--runs", str(max(1, int(runs))),
           "--retry", "1",
           "--browser", browser if browser in ("chrome", "edge") else "edge",
           "--no-save"]
    if direct:
        cmd.append("--direct")
    if max_wait_fcp:
        cmd += ["--max-wait-fcp", str(int(max_wait_fcp))]

    if on_log:
        on_log(f"⏳ در حال تست {url} ({runs} بار تکرار)...")

    with tempfile.NamedTemporaryFile("w+", suffix=".json", delete=False) as tf:
        tmp_path = tf.name
    try:
        cmd += ["--json", tmp_path]
        proc = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True,
            encoding="utf-8", errors="replace",
        )
        lhr = None
        if os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
            with open(tmp_path, "r", encoding="utf-8") as f:
                lhr = json.load(f)
        if lhr is None:
            msg = (proc.stderr or proc.stdout or "خروجی دریافت نشد").strip()[-400:]
            return {
                "ok": False, "url": url, "score": None, "grade": "نامشخص",
                "error": "no-report", "detail": msg, "runs": 0,
            }
        return summarize_lhr(lhr, url)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def run_many(urls, on_site=None, on_log=None, **kw):
    """چند سایت را پشت سر هم می‌سنجد. on_site(i, total, result) برای هر سایت."""
    total = len(urls)
    out = []
    for i, url in enumerate(urls):
        res = run_one(url, on_log=on_log, **kw)
        out.append(res)
        if on_site:
            on_site(i + 1, total, res)
    return out


def save_json(rows, path):
    """خروجی JSON کامل (بدون فیلدهای حجیم lhr)."""
    slim = []
    for r in rows:
        r = dict(r)
        r.pop("lhr", None)
        slim.append(r)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(slim, f, ensure_ascii=False, indent=2)
    return path


def save_csv(rows, path):
    import csv as _csv
    header = ["url", "score", "grade", "fcp_ms", "lcp_ms", "cls", "tbt_ms",
              "speed_index_ms", "ttfb_ms", "runs", "error"]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = _csv.writer(f)
        w.writerow(header)
        for r in rows:
            w.writerow([
                r.get("url", ""),
                "" if r.get("score") is None else r["score"],
                r.get("grade", ""),
                "" if r.get("fcp") is None else round(r["fcp"]),
                "" if r.get("lcp") is None else round(r["lcp"]),
                "" if r.get("cls") is None else round(r["cls"], 3),
                "" if r.get("tbt") is None else round(r["tbt"]),
                "" if r.get("si") is None else round(r["si"]),
                "" if r.get("ttfb") is None else round(r["ttfb"]),
                r.get("runs", 0),
                r.get("error", ""),
            ])
    return path
