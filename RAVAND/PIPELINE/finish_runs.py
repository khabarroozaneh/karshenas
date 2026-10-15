#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""کارهای پایانی بعد از اجرای کامل خط لولهٔ ۳-اجرایی.

خط لوله‌ای که در حال اجراست با کد قدیمی لود شده و فیلد runs را در کش
ثبت نمی‌کند (ولی مقادیر واقعاً میانهٔ ۳ اجرا هستند، چون cli.js با
--runs 3 صدا زده شده). این اسکریپت:

  ۱) صبر می‌کند تا پروسهٔ pipeline.py تمام شود،
  ۲) runs=3 و runScores را برای ورودی‌های فاقد آن پر می‌کند،
  ۳) فید پنل منشی را با کد جدید بازسازی می‌کند (--cached-only).
"""
import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "OUTPUT", "speed_cache.json")
LOG = r"C:\Users\home\AppData\Local\Temp\pipeline_3runs.log"


def pipeline_running():
    try:
        out = subprocess.run(
            ["powershell.exe", "-NoProfile", "-Command",
             "Get-CimInstance Win32_Process -Filter \"name='python.exe'\" | "
             "Where-Object {($_.CommandLine -like '*pipeline.py*') -and ($_.CommandLine -notlike '*finish_runs*')} | "
             "Select-Object -ExpandProperty ProcessId"],
            capture_output=True, text=True, timeout=30)
        return any(l.strip().isdigit() for l in out.stdout.splitlines())
    except Exception:
        return False


def backfill_runs():
    with open(CACHE, "r", encoding="utf-8") as f:
        cache = json.load(f)
    n = 0
    for key, v in cache.items():
        if isinstance(v, dict) and v.get("ok") and not v.get("runs"):
            # این ورودی‌ها همه با --runs 3 ساخته شده‌اند
            v["runs"] = 3
            v.setdefault("runScores", [])
            n += 1
    with open(CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    return n, len(cache)


def main():
    print("[finish] منتظر پایان خط لوله ...", flush=True)
    waited = 0
    while pipeline_running():
        time.sleep(30)
        waited += 30
        if waited % 300 == 0:
            print(f"[finish] {waited}s گذشته، خط لوله هنوز اجراست ...", flush=True)
    print("[finish] خط لوله تمام شد.", flush=True)

    n, total = backfill_runs()
    print(f"[finish] runs=3 برای {n} ورودی پر شد (جمعاً {total}).", flush=True)

    bank = os.path.join(HERE, "..", "1", "DATA", "1-235.xlsx")
    r = subprocess.run(
        [sys.executable, "pipeline.py", "--bank", bank, "--cached-only"],
        cwd=HERE)
    print(f"[finish] بازسازی فید: exit={r.returncode}", flush=True)


if __name__ == "__main__":
    main()
