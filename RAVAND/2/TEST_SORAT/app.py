# -*- coding: utf-8 -*-
"""رابط کاربر پسند برنامهٔ تست سرعت سایت‌ها (فارسی).

از core.py استفاده می‌کند:
  - فایل ورودی را کاربر انتخاب می‌کند (txt / csv / xlsx)
  - هر سایت چند بار تست می‌شود و میانهٔ نتایج نمایش داده می‌شود (دقت بالا)
  - نتایج به فارسی و رنگی نشان داده می‌شوند و در reports/ ذخیره می‌شوند
"""

import os
import queue
import threading
from datetime import datetime

import customtkinter as ctk
from tkinter import filedialog, messagebox

import core

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

FONT = "Tahoma"
REPORTS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")


class SpeedTestApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("تست سرعت سایت‌ها")
        self.geometry("960x760")
        self.minsize(820, 640)

        self.results = []
        self.is_scanning = False
        self.stop_flag = False
        self.input_path = None

        self._build_ui()

    # ---------------------------------------------------- رابط ----
    def _build_ui(self):
        header = ctk.CTkLabel(
            self, text="⚡ تست سرعت سایت‌ها",
            font=ctk.CTkFont(family=FONT, size=24, weight="bold"),
        )
        header.pack(pady=(16, 2))

        sub = ctk.CTkLabel(
            self,
            text="هر سایت چند بار تست می‌شود و میانهٔ نتایج نشان داده می‌شود — مثل گوگل PageSpeed، بدون نیاز به اینترنت خارجی",
            font=ctk.CTkFont(family=FONT, size=11),
            text_color="gray",
        )
        sub.pack(pady=(0, 10))

        # --- ورودی
        in_frame = ctk.CTkFrame(self, corner_radius=12)
        in_frame.pack(fill="x", padx=22, pady=(0, 8))

        ctk.CTkLabel(
            in_frame, text="🌐 آدرس سایت‌ها (هر خط یک سایت):",
            font=ctk.CTkFont(family=FONT, size=13, weight="bold"),
        ).pack(anchor="e", padx=14, pady=(10, 4))

        self.url_box = ctk.CTkTextbox(in_frame, height=96, corner_radius=8,
                                      font=ctk.CTkFont(family=FONT, size=13))
        self.url_box.pack(fill="x", padx=14, pady=(0, 6))

        row = ctk.CTkFrame(in_frame, fg_color="transparent")
        row.pack(fill="x", padx=14, pady=(0, 10))

        self.file_btn = ctk.CTkButton(
            row, text="📁 انتخاب فایل ورودی", width=180, height=34,
            font=ctk.CTkFont(family=FONT, size=13, weight="bold"),
            fg_color="gray", command=self.choose_file,
        )
        self.file_btn.pack(side="right", padx=(6, 0))

        self.clear_btn = ctk.CTkButton(
            row, text="🗑 پاک کردن", width=110, height=34,
            font=ctk.CTkFont(family=FONT, size=13),
            fg_color="gray", command=self.clear_all,
        )
        self.clear_btn.pack(side="right")

        self.file_label = ctk.CTkLabel(
            in_frame, text="فایلی انتخاب نشده — می‌توانید آدرس‌ها را مستقیم بنویسید",
            font=ctk.CTkFont(family=FONT, size=11),
            text_color="gray",
        )
        self.file_label.pack(anchor="e", padx=14, pady=(0, 10))

        # --- تنظیمات
        set_frame = ctk.CTkFrame(self, corner_radius=12)
        set_frame.pack(fill="x", padx=22, pady=(0, 8))

        ctk.CTkLabel(
            set_frame, text="⚙️ تنظیمات",
            font=ctk.CTkFont(family=FONT, size=13, weight="bold"),
        ).pack(anchor="e", padx=14, pady=(10, 6))

        grid = ctk.CTkFrame(set_frame, fg_color="transparent")
        grid.pack(fill="x", padx=14, pady=(0, 10))
        grid.grid_columnconfigure((0, 1), weight=1)

        # ستون راست: سطح دقت
        ctk.CTkLabel(
            grid, text="دقت تست (تعداد تکرار):",
            font=ctk.CTkFont(family=FONT, size=12),
        ).grid(row=0, column=1, sticky="e", pady=(0, 4))

        self.accuracy = ctk.CTkSegmentedButton(
            grid,
            values=["سریع (۱ بار)", "متعادل (۳ بار)", "دقیق (۵ بار)"],
            font=ctk.CTkFont(family=FONT, size=12),
            command=self.on_accuracy_change,
        )
        self.accuracy.set("متعادل (۳ بار)")
        self.runs = 3
        self.accuracy.grid(row=1, column=1, sticky="ew", padx=(8, 0))

        # ستون چپ: مرورگر
        ctk.CTkLabel(
            grid, text="مرورگر:",
            font=ctk.CTkFont(family=FONT, size=12),
        ).grid(row=0, column=0, sticky="e", pady=(0, 4))

        self.browser_var = ctk.CTkSegmentedButton(
            grid, values=["Chrome", "Edge"],
            font=ctk.CTkFont(family=FONT, size=12),
        )
        self.browser_var.set("Chrome")
        self.browser_var.grid(row=1, column=0, sticky="ew", padx=(0, 8))

        self.direct_switch = ctk.CTkSwitch(
            set_frame, text="اتصال مستقیم (نادیده گرفتن پروکسی/VPN سیستم)",
            font=ctk.CTkFont(family=FONT, size=12),
        )
        self.direct_switch.select()
        self.direct_switch.pack(anchor="e", padx=14, pady=(0, 10))

        # --- دکمه‌ها
        btn_row = ctk.CTkFrame(self, fg_color="transparent")
        btn_row.pack(fill="x", padx=22, pady=(0, 6))

        self.start_btn = ctk.CTkButton(
            btn_row, text="🚀 شروع تست", width=160, height=38,
            font=ctk.CTkFont(family=FONT, size=14, weight="bold"),
            command=self.start_scan,
        )
        self.start_btn.pack(side="right", padx=(8, 0))

        self.stop_btn = ctk.CTkButton(
            btn_row, text="⛔ توقف", width=120, height=38,
            font=ctk.CTkFont(family=FONT, size=14),
            fg_color="#c0392b", hover_color="#a93226",
            state="disabled", command=self.stop_scan,
        )
        self.stop_btn.pack(side="right")

        self.save_btn = ctk.CTkButton(
            btn_row, text="💾 ذخیره خروجی", width=150, height=38,
            font=ctk.CTkFont(family=FONT, size=14),
            fg_color="gray", state="disabled", command=self.save_outputs,
        )
        self.save_btn.pack(side="left")

        # --- پیشرفت
        self.progress = ctk.CTkProgressBar(self, height=14, corner_radius=7)
        self.progress.pack(fill="x", padx=22, pady=(4, 2))
        self.progress.set(0)

        self.status_label = ctk.CTkLabel(
            self, text="آماده",
            font=ctk.CTkFont(family=FONT, size=12), text_color="gray",
        )
        self.status_label.pack(pady=(2, 8))

        # --- نتایج
        res_frame = ctk.CTkFrame(self, corner_radius=12)
        res_frame.pack(fill="both", expand=True, padx=22, pady=(0, 14))

        res_header = ctk.CTkFrame(res_frame, fg_color="transparent")
        res_header.pack(fill="x", padx=14, pady=(10, 4))

        ctk.CTkLabel(
            res_header, text="📊 نتایج",
            font=ctk.CTkFont(family=FONT, size=14, weight="bold"),
        ).pack(side="right")

        self.count_label = ctk.CTkLabel(
            res_header, text="تست شده: ۰ | موفق: ۰ | ناموفق: ۰",
            font=ctk.CTkFont(family=FONT, size=12), text_color="gray",
        )
        self.count_label.pack(side="left")

        self.res_list = ctk.CTkScrollableFrame(
            res_frame, corner_radius=8,
            label_text="روی هر سایت یک کارت با نمره و جزئیات ساخته می‌شود",
        )
        self.res_list.pack(fill="both", expand=True, padx=10, pady=(0, 12))

    # -------------------------------------------- رویدادها ----
    def on_accuracy_change(self, value):
        self.runs = {"سریع (۱ بار)": 1, "متعادل (۳ بار)": 3, "دقیق (۵ بار)": 5}[value]
        self.status_label.configure(
            text=f"دقت تنظیم شد: {value.strip()} — هر سایت {core.fa(self.runs)} بار تست می‌شود",
            text_color="gray",
        )

    def choose_file(self):
        path = filedialog.askopenfilename(
            title="انتخاب فایل لیست سایت‌ها",
            filetypes=[
                ("فایل اکسل", "*.xlsx"),
                ("فایل CSV", "*.csv"),
                ("متن", "*.txt"),
                ("همه فایل‌ها", "*.*"),
            ],
        )
        if not path:
            return
        try:
            urls = core.read_urls(path)
        except Exception as e:
            messagebox.showerror("خطا", f"نتوانستم فایل را بخوانم:\n{e}")
            return
        if not urls:
            messagebox.showwarning("توجه", "هیچ آدرس سایت‌ای در این فایل پیدا نشد!")
            return

        self.input_path = path
        self.url_box.delete("1.0", "end")
        self.url_box.insert("1.0", "\n".join(urls))
        self.file_label.configure(
            text=f"📄 {os.path.basename(path)} — {core.fa(len(urls))} سایت بارگذاری شد",
            text_color="green",
        )
        self.status_label.configure(
            text=f"{core.fa(len(urls))} سایت آمادهٔ تست", text_color="green",
        )

    def clear_all(self):
        self.url_box.delete("1.0", "end")
        self.input_path = None
        self.results = []
        self.file_label.configure(
            text="فایلی انتخاب نشده — می‌توانید آدرس‌ها را مستقیم بنویسید",
            text_color="gray",
        )
        for w in self.res_list.winfo_children():
            w.destroy()
        self.progress.set(0)
        self.count_label.configure(text="تست شده: ۰ | موفق: ۰ | ناموفق: ۰")
        self.status_label.configure(text="آماده", text_color="gray")
        self.save_btn.configure(state="disabled")

    def stop_scan(self):
        self.stop_flag = True
        self.status_label.configure(text="در حال توقف بعد از سایت جاری...", text_color="orange")

    def start_scan(self):
        if self.is_scanning:
            return

        raw = self.url_box.get("1.0", "end").strip()
        if not raw:
            messagebox.showwarning("توجه", "اول آدرس سایت‌ها را وارد کنید یا یک فایل انتخاب کنید!")
            return

        urls = [u.strip() for u in raw.splitlines() if u.strip()]
        if not urls:
            messagebox.showwarning("توجه", "هیچ آدرسی پیدا نشد!")
            return

        self.is_scanning = True
        self.stop_flag = False
        self._q = queue.Queue()
        self._drain_queue()
        self.results = []
        self.start_btn.configure(state="disabled", text="⏳ در حال تست...")
        self.stop_btn.configure(state="normal")
        self.save_btn.configure(state="disabled")
        for w in self.res_list.winfo_children():
            w.destroy()
        self.progress.set(0)

        threading.Thread(target=self._run_scan, args=(urls,), daemon=True).start()

    def _drain_queue(self):
        """پیام‌های نخِ تست را در نخ اصلی پردازش می‌کند (Tk از نخ دیگر امن نیست)."""
        try:
            while True:
                item = self._q.get_nowait()
                kind = item[0]
                if kind == "log":
                    self.status_label.configure(text=item[1], text_color="gray")
                elif kind == "site":
                    self._on_site(item[1], item[2], item[3])
                elif kind == "done":
                    self.is_scanning = False
                    self._scan_finished(item[1])
                    return
        except queue.Empty:
            pass
        if self.is_scanning:
            self.after(120, self._drain_queue)

    def _run_scan(self, urls):
        browser = self.browser_var.get().lower()
        direct = bool(self.direct_switch.get())
        total = len(urls)

        def on_site(i, t, res):
            self._q.put(("site", i, t, res))

        def on_log(msg):
            self._q.put(("log", msg))

        for i, url in enumerate(urls):
            if self.stop_flag:
                break
            res = core.run_one(
                url, runs=self.runs, browser=browser, direct=direct,
                max_wait_fcp=180000, on_log=on_log,
            )
            self.results.append(res)
            on_site(i + 1, total, res)

        self._q.put(("done", total))

    def _on_site(self, i, total, res):
        self.progress.set(i / total)
        ok = sum(1 for r in self.results if r["ok"])
        bad = len(self.results) - ok
        self.count_label.configure(
            text=f"تست شده: {core.fa(len(self.results))} "
                 f"| موفق: {core.fa(ok)} | ناموفق: {core.fa(bad)}"
        )
        if res["ok"]:
            self.status_label.configure(
                text=f"✅ {res['url']} — نمره {core.fa(res['score'])}",
                text_color="green",
            )
        else:
            self.status_label.configure(
                text=f"❌ {res['url']} — {res.get('error')}",
                text_color="#e74c3c",
            )
        self._add_card(res)

    def _add_card(self, res):
        url = res["url"]
        grade = res.get("grade", "نامشخص")
        fg, bg = core.GRADE_COLOR.get(grade, core.GRADE_COLOR["نامشخص"])

        card = ctk.CTkFrame(self.res_list, corner_radius=10, fg_color="#232323")
        card.pack(fill="x", padx=5, pady=6)

        head = ctk.CTkFrame(card, fg_color="transparent")
        head.pack(fill="x", padx=12, pady=(8, 2))

        ctk.CTkLabel(
            head, text=url,
            font=ctk.CTkFont(family=FONT, size=13, weight="bold"),
            text_color="#3b8ed0",
        ).pack(side="right")

        score_text = f"{core.fa(res['score'])} / ۱۰۰" if res["ok"] else "ناموفق"
        ctk.CTkLabel(
            head, text=f"{score_text}   {grade}",
            font=ctk.CTkFont(family=FONT, size=13, weight="bold"),
            text_color=fg,
        ).pack(side="left")

        if not res["ok"]:
            detail = (res.get("detail") or "")[:300]
            ctk.CTkLabel(
                card, text=f"⚠️ خطا: {res.get('error')}  {detail}",
                font=ctk.CTkFont(family=FONT, size=11),
                text_color="#e6a23c", wraplength=820, justify="right",
            ).pack(anchor="e", padx=12, pady=(2, 8))
            return

        # میانهٔ چند اجرا
        if res.get("runs", 1) > 1 and res.get("runScores"):
            scores = " , ".join(core.fa(s) for s in res["runScores"])
            ctk.CTkLabel(
                card,
                text=f"🎯 میانهٔ {core.fa(res['runs'])} اجرا (نمره‌ها: {scores})",
                font=ctk.CTkFont(family=FONT, size=11),
                text_color="#7a9ec2",
            ).pack(anchor="e", padx=12, pady=(2, 0))

        # شاخص‌ها
        m_frame = ctk.CTkFrame(card, fg_color="transparent")
        m_frame.pack(fill="x", padx=12, pady=(4, 2))
        for key, label, kind in core.METRIC_FA:
            if key == "score":
                continue
            v = res.get(key)
            if v is None:
                continue
            text = core.fmt_ms(v) if kind == "ms" else f"{core.fa(round(v, 3))}"
            box = ctk.CTkFrame(m_frame, fg_color="#1c1c1c", corner_radius=6)
            box.pack(side="right", expand=True, fill="x", padx=3)
            ctk.CTkLabel(
                box, text=label,
                font=ctk.CTkFont(family=FONT, size=10), text_color="#9aa5b1",
            ).pack(anchor="e", padx=6, pady=(4, 0))
            ctk.CTkLabel(
                box, text=text,
                font=ctk.CTkFont(family=FONT, size=13, weight="bold"),
            ).pack(anchor="e", padx=6, pady=(0, 4))

        # فرصت‌های بهبود
        opps = res.get("opportunities") or []
        if opps:
            ctk.CTkLabel(
                card, text=f"🧩 مهم‌ترین دلایل کندی ({core.fa(len(opps))}):",
                font=ctk.CTkFont(family=FONT, size=11, weight="bold"),
                text_color="#aaaaaa",
            ).pack(anchor="e", padx=12, pady=(6, 2))
            for o in opps[:4]:
                gain = ""
                if o.get("ms"):
                    gain = f" (~{core.fmt_ms(o['ms'])} سریع‌تر)"
                elif o.get("kb"):
                    gain = f" (~{core.fa(o['kb'])} کیلوبایت سبک‌تر)"
                ctk.CTkLabel(
                    card, text=f"• {o['fa']}{gain}",
                    font=ctk.CTkFont(family=FONT, size=11),
                    text_color="#e0e0e0", wraplength=820, justify="right",
                ).pack(anchor="e", padx=18, pady=1)

    def _scan_finished(self, total):
        self.is_scanning = False
        self.stop_flag = False
        self.start_btn.configure(state="normal", text="🚀 شروع تست")
        self.stop_btn.configure(state="disabled")

        ok = sum(1 for r in self.results if r["ok"])
        bad = len(self.results) - ok
        self.count_label.configure(
            text=f"تست شده: {core.fa(len(self.results))} "
                 f"| موفق: {core.fa(ok)} | ناموفق: {core.fa(bad)}"
        )

        if self.results:
            self.save_btn.configure(state="normal")
            saved = self.save_outputs()
            avg = core.fa(round(sum(r["score"] for r in self.results if r["ok"]) / ok)) if ok else "—"
            messagebox.showinfo(
                "پایان تست",
                f"✅ موفق: {core.fa(ok)}\n"
                f"❌ ناموفق: {core.fa(bad)}\n"
                f"⌀ میانگین نمره: {avg}\n\n"
                f"💾 خروجی‌ها ذخیره شد:\n{saved}",
            )
            self.status_label.configure(
                text=f"✅ تست پایان یافت — {core.fa(ok)} سایت موفق", text_color="green",
            )
        else:
            self.status_label.configure(text="تستی انجام نشد", text_color="gray")

    def save_outputs(self):
        """نتایج را به‌صورت JSON و CSV در پوشهٔ reports ذخیره می‌کند."""
        if not self.results:
            return ""
        os.makedirs(REPORTS, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        base = os.path.join(REPORTS, f"speedtest-{stamp}")
        out = []
        try:
            out.append(core.save_json(self.results, base + ".json"))
        except Exception as e:
            out.append(f"خطای JSON: {e}")
        try:
            out.append(core.save_csv(self.results, base + ".csv"))
        except Exception as e:
            out.append(f"خطای CSV: {e}")
        return "\n".join(out)


if __name__ == "__main__":
    app = SpeedTestApp()
    app.mainloop()
