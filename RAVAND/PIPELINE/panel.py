# -*- coding: utf-8 -*-
"""
پنل کاربرپسند خط لوله — انتخاب بانک از داخل پنل، نه از خط فرمان
================================================================
- GET /            -> صفحهٔ پنل (panel.html)
- GET /api/banks   -> فهرست فایل‌های اکسل موجود در RAVAND/1/DATA
- POST /api/run    -> اجرای خط لوله روی بانک انتخاب‌شده (در پس‌زمینه)
- GET /api/status  -> وضعیت اجرا + لاگ‌های زنده
- GET /api/feed    -> خلاصهٔ فید ساخته‌شده

اجرا:  python panel.py   ->  http://127.0.0.1:8124/
"""

import json
import os
import subprocess
import sys
import threading
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, "..", "1", "DATA")
OUTPUT_DIR = os.path.join(BASE, "OUTPUT")
PANEL_HTML = os.path.join(BASE, "panel.html")
FEED_PATH = os.path.join(OUTPUT_DIR, "secretary_feed.json")
PORT = int(os.environ.get("WPJOO_PANEL_PORT", "8124"))
MAX_LINES = 400

# مراحل قابل فعال/غیرفعال در پنل و نام فارسی هر کدام
VALID_STAGES = ("detect", "speed", "feed")
STAGE_FA = {"detect": "تشخیص وردپرس",
            "speed": "تست سرعت",
            "feed": "ساخت فید"}

_lock = threading.Lock()
_job = {
    "running": False,          # آیا خط لوله در حال اجراست
    "pid": None,               # شناسهٔ پروسه
    "bank": None,              # بانک انتخاب‌شده
    "mode": None,              # full | cached
    "stages": None,            # مراحل انتخابی در حالت full
    "lines": [],               # لاگ‌های زنده
    "startedAt": None,
    "finishedAt": None,
    "exitCode": None,
}


def log(msg):
    with _lock:
        _job["lines"].append(msg)
        # نگه‌داشتن آخرین خطوط برای جلوگیری از مصرف حافظه
        if len(_job["lines"]) > MAX_LINES:
            del _job["lines"][: len(_job["lines"]) - MAX_LINES]


def find_banks():
    """فایل‌های اکسل موجود در پوشهٔ داده‌ها را برمی‌گرداند (نسبی به DATA_DIR)."""
    banks = []
    if os.path.isdir(DATA_DIR):
        for name in sorted(os.listdir(DATA_DIR)):
            if name.lower().endswith((".xlsx", ".xls")):
                p = os.path.join(DATA_DIR, name)
                banks.append({
                    "name": name,
                    "path": os.path.normpath(os.path.abspath(p)),
                    "size": os.path.getsize(p),
                    "mtime": int(os.path.getmtime(p)),
                })
    return banks


def feed_summary():
    """خلاصهٔ فید فعلی پنل منشی."""
    if not os.path.exists(FEED_PATH):
        return {"exists": False, "count": 0}
    try:
        with open(FEED_PATH, encoding="utf-8") as f:
            feed = json.load(f)
        arr = feed if isinstance(feed, list) else (feed.get("leads") or [])
        return {
            "exists": True,
            "count": len(arr),
            "updatedAt": int(os.path.getmtime(FEED_PATH)),
        }
    except Exception as err:
        return {"exists": True, "count": 0, "error": str(err)}


def run_pipeline(bank_path, mode, stages=None):
    """اجرای pipeline.py در یک نخ جداگانه و جمع‌آوری لاگ‌ها.

    stages: لیست مراحل انتخابی در پنل (detect / speed / feed)؛ فقط در حالت full.
    """
    stages = list(stages or VALID_STAGES)
    with _lock:
        _job.update({
            "running": True, "pid": None, "bank": bank_path, "mode": mode,
            "stages": stages if mode == "full" else None,
            "lines": [], "startedAt": datetime.now().isoformat(),
            "finishedAt": None, "exitCode": None,
        })

    cmd = [sys.executable, os.path.join(BASE, "pipeline.py"),
           "--bank", bank_path]
    if mode == "cached":
        cmd.append("--cached-only")
        desc = "بازسازی فید از کش"
    else:
        cmd += ["--stages", ",".join(stages)]
        desc = ("مراحل: " +
                "، ".join(STAGE_FA[s] for s in VALID_STAGES if s in stages))

    log(f"⚡ شروع خط لوله | بانک: {os.path.basename(bank_path)} | {desc}")

    try:
        # text=true با encoding utf-8 تا خروجی فارسی/اموجی در ویندوز سالم بماند
        proc = subprocess.Popen(
            cmd, cwd=BASE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", bufsize=1)
        with _lock:
            _job["pid"] = proc.pid
        for line in iter(proc.stdout.readline, ""):
            log(line.rstrip("\r\n"))
        code = proc.wait()
        with _lock:
            _job["exitCode"] = code
        log("✅ خط لوله با موفقیت تمام شد" if code == 0
            else f"❌ خط لوله با کد خطای {code} تمام شد")
    except Exception as err:
        with _lock:
            _job["exitCode"] = -1
        log(f"❌ خطا در اجرای خط لوله: {err}")
    finally:
        with _lock:
            _job["running"] = False
            _job["finishedAt"] = datetime.now().isoformat()


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json; charset=utf-8"):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _json(self, obj, code=200):
        self._send(code, json.dumps(obj, ensure_ascii=False))

    def do_GET(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        if path == "" :
            if os.path.exists(PANEL_HTML):
                with open(PANEL_HTML, encoding="utf-8") as f:
                    self._send(200, f.read(), "text/html; charset=utf-8")
            else:
                self._send(404, "panel.html پیدا نشد", "text/plain; charset=utf-8")
        elif path == "/api/banks":
            self._json({"banks": find_banks(), "dir": os.path.abspath(DATA_DIR)})
        elif path == "/api/status":
            with _lock:
                self._json({
                    "running": _job["running"],
                    "bank": _job["bank"],
                    "mode": _job["mode"],
                    "stages": _job["stages"],
                    "startedAt": _job["startedAt"],
                    "finishedAt": _job["finishedAt"],
                    "exitCode": _job["exitCode"],
                    "lines": list(_job["lines"][-120:]),
                })
        elif path == "/api/feed":
            self._json(feed_summary())
        else:
            self._send(404, "مسیر نامعتبر", "text/plain; charset=utf-8")

    def do_POST(self):
        path = self.path.split("?", 1)[0].rstrip("/")
        length = int(self.headers.get("Content-Length", 0) or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            payload = json.loads(raw.decode("utf-8") or "{}")
        except Exception:
            self._json({"ok": False, "error": "JSON نامعتبر"}, 400)
            return

        if path != "/api/run":
            self._send(404, "مسیر نامعتبر", "text/plain; charset=utf-8")
            return

        with _lock:
            if _job["running"]:
                self._json({"ok": False,
                            "error": "خط لوله از قبل در حال اجراست. تا پایان منتظر بمانید."},
                           409)
                return

        bank = str(payload.get("bank") or "").strip()
        mode = "cached" if str(payload.get("mode") or "full") == "cached" else "full"

        # مراحل انتخابی از چک‌باکس‌های پنل (فقط در حالت اجرای سفارشی)
        stages = []
        if mode == "full":
            raw = payload.get("stages")
            if raw is None:
                stages = list(VALID_STAGES)
            elif isinstance(raw, list):
                stages = [str(s).strip().lower() for s in raw if str(s).strip()]
            if not stages or any(s not in VALID_STAGES for s in stages):
                self._json({"ok": False,
                            "error": "مقدار مراحل انتخابی نامعتبر است "
                                     "(مقادیر مجاز: detect, speed, feed)"}, 400)
                return

        # بانک باید یکی از فایل‌های موجود در پوشهٔ داده‌ها باشد
        # مسیرها قبل از مقایسه نرمالایز می‌شوند تا تفاوت / و \\ مشکل نسازد
        banks = {os.path.normpath(b["path"]) for b in find_banks()}
        if not bank or os.path.normpath(bank) not in banks:
            self._json({"ok": False,
                        "error": "بانک انتخاب‌شده در فهرست فایل‌های موجود نیست"}, 400)
            return

        threading.Thread(target=run_pipeline, args=(bank, mode, stages),
                         daemon=True).start()
        self._json({"ok": True, "bank": bank, "mode": mode, "stages": stages})

    def log_message(self, *args):
        # لاول‌های پیش‌فرض سرور را آراتس نمی‌کنیم
        pass


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print("=" * 60)
    print("  پنل خط لوله — انتخاب بانک و اجرای خط لوله")
    print("=" * 60)
    print(f"  آدرس پنل:    {url}")
    print(f"  پوشهٔ بانک‌ها: {os.path.abspath(DATA_DIR)}")
    print("  برای توقف، این پنجره را ببندید.")
    print("=" * 60)
    # باز کردن خودکار مرورگر فقط در حالت تعاملی
    if sys.stdin.isatty():
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
