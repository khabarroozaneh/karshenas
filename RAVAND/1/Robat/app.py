"""
WordPress Detector Pro v3.0 - Modern GUI
Detects WordPress sites + their technologies
"""

import customtkinter as ctk
from tkinter import filedialog, messagebox
from detector import WordPressDetector
import threading


ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")


class WordPressDetectorApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("WordPress Detector Pro v3.0")
        self.geometry("850x650")
        self.minsize(750, 550)

        self.detector = WordPressDetector(timeout=15, max_workers=5)
        self.is_scanning = False

        self._build_ui()

    def _build_ui(self):
        # Header
        header = ctk.CTkLabel(
            self, text="🔍 WordPress Detector Pro",
            font=ctk.CTkFont(size=26, weight="bold"),
        )
        header.pack(pady=(18, 4))

        sub = ctk.CTkLabel(
            self,
            text="Detects WordPress sites and their technologies (plugins, builders, SEO...)",
            font=ctk.CTkFont(size=12), text_color="gray",
        )
        sub.pack(pady=(0, 12))

        # Input frame
        input_frame = ctk.CTkFrame(self, corner_radius=12)
        input_frame.pack(fill="x", padx=25, pady=(0, 10))

        ctk.CTkLabel(
            input_frame, text="🌐 Enter URLs (one per line):",
            font=ctk.CTkFont(size=13, weight="bold"),
        ).pack(anchor="w", padx=15, pady=(10, 5))

        self.url_box = ctk.CTkTextbox(input_frame, height=100, corner_radius=8)
        self.url_box.pack(fill="x", padx=15, pady=(0, 8))

        btn_row = ctk.CTkFrame(input_frame, fg_color="transparent")
        btn_row.pack(fill="x", padx=15, pady=(0, 12))

        self.scan_btn = ctk.CTkButton(
            btn_row, text="🚀 Start Scan", width=140, height=34,
            font=ctk.CTkFont(size=13, weight="bold"),
            command=self.start_scan,
        )
        self.scan_btn.pack(side="left", padx=(0, 8))

        self.file_btn = ctk.CTkButton(
            btn_row, text="📁 Load File", width=120, height=34,
            fg_color="gray", command=self.load_file,
        )
        self.file_btn.pack(side="left", padx=(0, 8))

        self.clear_btn = ctk.CTkButton(
            btn_row, text="🗑️ Clear", width=100, height=34,
            fg_color="gray", command=self.clear_all,
        )
        self.clear_btn.pack(side="left")

        # Progress
        self.progress = ctk.CTkProgressBar(self, height=14, corner_radius=7)
        self.progress.pack(fill="x", padx=25, pady=(5, 2))
        self.progress.set(0)

        self.status_label = ctk.CTkLabel(
            self, text="Ready", font=ctk.CTkFont(size=12), text_color="gray"
        )
        self.status_label.pack(pady=(2, 8))

        # Results frame
        res_frame = ctk.CTkFrame(self, corner_radius=12)
        res_frame.pack(fill="both", expand=True, padx=25, pady=(0, 15))

        res_header = ctk.CTkFrame(res_frame, fg_color="transparent")
        res_header.pack(fill="x", padx=15, pady=(10, 5))

        ctk.CTkLabel(
            res_header, text="📊 Results",
            font=ctk.CTkFont(size=14, weight="bold"),
        ).pack(side="left")

        self.count_label = ctk.CTkLabel(
            res_header, text="WordPress: 0 | Non-WP: 0 | Blocked: 0 | Errors: 0",
            font=ctk.CTkFont(size=12), text_color="gray",
        )
        self.count_label.pack(side="right")

        # Tabview
        self.tabs = ctk.CTkTabview(res_frame, corner_radius=10)
        self.tabs.pack(fill="both", expand=True, padx=12, pady=(0, 12))

        tab_wp = self.tabs.add("✅ WordPress + Tech")
        tab_non = self.tabs.add("❌ Non-WordPress")
        tab_blk = self.tabs.add("🧱 Blocked (unknown)")
        tab_err = self.tabs.add("⚠️ Errors")

        self.wp_list = ctk.CTkScrollableFrame(
            tab_wp, corner_radius=8,
            label_text="WordPress sites & detected technologies",
        )
        self.wp_list.pack(fill="both", expand=True, padx=8, pady=8)

        self.non_list = ctk.CTkTextbox(tab_non, corner_radius=8)
        self.non_list.pack(fill="both", expand=True, padx=8, pady=8)

        self.blocked_list = ctk.CTkTextbox(tab_blk, corner_radius=8)
        self.blocked_list.pack(fill="both", expand=True, padx=8, pady=8)

        self.err_list = ctk.CTkTextbox(tab_err, corner_radius=8)
        self.err_list.pack(fill="both", expand=True, padx=8, pady=8)

    def load_file(self):
        path = filedialog.askopenfilename(
            filetypes=[("Text files", "*.txt"), ("All files", "*.*")]
        )
        if path:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = "\n".join(
                        line.strip() for line in f
                        if line.strip() and not line.startswith("#")
                    )
                self.url_box.delete("1.0", "end")
                self.url_box.insert("1.0", content)
                n = len(content.splitlines())
                self.status_label.configure(
                    text=f"Loaded {n} URLs", text_color="green"
                )
            except Exception as e:
                messagebox.showerror("Error", f"Could not read file:\n{e}")

    def clear_all(self):
        self.url_box.delete("1.0", "end")
        self.clear_results()
        self.progress.set(0)
        self.count_label.configure(
            text="WordPress: 0 | Non-WP: 0 | Blocked: 0 | Errors: 0"
        )
        self.status_label.configure(text="Ready", text_color="gray")

    def clear_results(self):
        for w in self.wp_list.winfo_children():
            w.destroy()
        self.non_list.delete("1.0", "end")
        self.blocked_list.delete("1.0", "end")
        self.err_list.delete("1.0", "end")

    def start_scan(self):
        if self.is_scanning:
            return

        raw = self.url_box.get("1.0", "end").strip()
        if not raw:
            messagebox.showwarning("Warning", "Please enter some URLs first!")
            return

        urls = [u.strip() for u in raw.splitlines() if u.strip()]
        if not urls:
            messagebox.showwarning("Warning", "No valid URLs found!")
            return

        self.is_scanning = True
        self.scan_btn.configure(state="disabled", text="⏳ Scanning...")
        self.clear_results()
        self.progress.set(0)
        self.scanned_count = 0
        self.total_count = len(urls)

        threading.Thread(target=self._run_scan, args=(urls,), daemon=True).start()

    def _run_scan(self, urls):
        self.total_count = len(urls)
        self.detector.results = {
            "wordpress": [], "not_wordpress": [], "errors": [], "blocked": []
        }

        def callback(result):
            self.scanned_count += 1
            self.after(0, self._update_ui, result)

        self.detector.check_all(urls, callback=callback)
        self.after(0, self._scan_finished)

    def _update_ui(self, result):
        url = result["url"]
        status = result["status"]
        done = getattr(self, "scanned_count", 1)
        total = getattr(self, "total_count", 1)

        # Update progress
        self.progress.set(done / total)
        self.status_label.configure(text=f"Scanning {done}/{total}: {url[:45]}")

        if status == "wordpress":
            self._add_wp_card(result)
        elif status == "blocked":
            msg = result.get("message", "Blocked")
            title = result.get("page_title") or ""
            self.blocked_list.insert(
                "end", f"🧱 {url} — {msg}"
                       + (f"  [{title}]" if title else "") + "\n"
            )
        elif status == "error":
            msg = result.get("message", "Error")
            self.err_list.insert("end", f"⚠️ {url} — {msg}\n")
        else:
            self.non_list.insert("end", f"❌ {url}\n")

        # Update counters
        r = self.detector.results
        self.count_label.configure(
            text=f"WordPress: {len(r['wordpress'])} | "
                 f"Non-WP: {len(r['not_wordpress'])} | "
                 f"Blocked: {len(r.get('blocked', []))} | "
                 f"Errors: {len(r['errors'])}"
        )

    def _add_wp_card(self, result):
        """Create a technology card for a WordPress site"""
        url = result["url"]
        techs = result.get("technologies", {})

        card = ctk.CTkFrame(self.wp_list, corner_radius=10, fg_color="#232323")
        card.pack(fill="x", padx=5, pady=6)

        # Site URL header
        title = ctk.CTkLabel(
            card, text=f"✅ {url}",
            font=ctk.CTkFont(size=14, weight="bold"),
            text_color="#3b8ed0",
        )
        title.pack(anchor="w", padx=12, pady=(8, 2))

        if result.get("final_url") and result["final_url"] != url:
            ctk.CTkLabel(
                card, text=f"   → {result['final_url']}",
                font=ctk.CTkFont(size=10), text_color="gray",
            ).pack(anchor="w", padx=12)

        if result.get("note"):
            ctk.CTkLabel(
                card, text=f"   ⚠️ {result['note']}",
                font=ctk.CTkFont(size=10), text_color="#e6a23c",
                wraplength=700, justify="left",
            ).pack(anchor="w", padx=12, pady=(2, 0))

        # Technologies
        if techs:
            n = len(techs)
            ctk.CTkLabel(
                card, text=f"🧩 {n} technologies detected:",
                font=ctk.CTkFont(size=11, weight="bold"),
                text_color="#aaaaaa",
            ).pack(anchor="w", padx=12, pady=(4, 2))

            for name, cat in techs.items():
                row = ctk.CTkFrame(card, fg_color="transparent")
                row.pack(fill="x", padx=16, pady=1)
                ctk.CTkLabel(
                    row, text=f"• {name}",
                    font=ctk.CTkFont(size=11), text_color="#e0e0e0",
                ).pack(side="left")
                ctk.CTkLabel(
                    row, text=cat,
                    font=ctk.CTkFont(size=10), text_color="#7a9ec2",
                ).pack(side="right")
        else:
            ctk.CTkLabel(
                card, text="   (no extra technologies detected)",
                font=ctk.CTkFont(size=11), text_color="gray",
            ).pack(anchor="w", padx=12, pady=(2, 8))

    def _scan_finished(self):
        self.is_scanning = False
        self.scan_btn.configure(state="normal", text="🚀 Start Scan")
        self.status_label.configure(text="✅ Scan complete!", text_color="green")
        r = self.detector.results
        n = len(r["wordpress"])
        n_blocked = len(r.get("blocked", []))

        if n_blocked and not n:
            self.status_label.configure(
                text="⚠️ Done - some sites are behind a firewall",
                text_color="#e6a23c",
            )
        # Automatically save the JSON report (links + technologies) when
        # the scan finishes and there is at least one WordPress site.
        saved_line = ""
        if n:
            try:
                path = self.detector.save_json()
                saved_line = f"\n\n💾 Report saved to:\n{path}"
            except Exception as e:
                saved_line = f"\n\n⚠️ Could not save report: {e}"

        messagebox.showinfo(
            "Scan Complete",
            f"✅ WordPress: {n}\n"
            f"❌ Non-WP:    {len(r['not_wordpress'])}\n"
            f"🧱 Blocked:   {n_blocked}\n"
            f"⚠️ Errors:    {len(r['errors'])}{saved_line}",
        )

if __name__ == "__main__":
    app = WordPressDetectorApp()
    app.mainloop()