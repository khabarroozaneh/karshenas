"""
WordPress & Technology Detector - Core Engine
Detects WordPress sites and their technologies
"""

import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import json
import os
import re
import time
import urllib3

# Suppress SSL warnings (professional fix)
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Always save reports next to this script, regardless of the current
# working directory (e.g. when the GUI is launched from another folder)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))


# Technology signatures - focused on WordPress ecosystem
SIGNATURES = {
    "WooCommerce": {"cat": "E-Commerce", "patterns": [r"woocommerce", r"wc-ajax"]},
    "Elementor": {"cat": "Page Builder", "patterns": [r"elementor"]},
    "Divi Builder": {"cat": "Page Builder", "patterns": [r"et_builder", r"divi"]},
    "WPBakery": {"cat": "Page Builder", "patterns": [r"js_composer", r"wpbakery"]},
    "Yoast SEO": {"cat": "SEO Plugin", "patterns": [r"yoast-schema-graph", r"/ Yoast SEO"]},
    "Rank Math": {"cat": "SEO Plugin", "patterns": [r"rank-math"]},
    "Contact Form 7": {"cat": "Form Plugin", "patterns": [r"contact-form-7", r"wpcf7"]},
    "WPML": {"cat": "Multilingual", "patterns": [r"sitepress", r"wpml"]},
    "Jetpack": {"cat": "Plugin Suite", "patterns": [r"jetpack"]},
    "WP Rocket": {"cat": "Caching", "patterns": [r"wp-rocket", r"wprocket"]},
    "LiteSpeed Cache": {"cat": "Caching", "patterns": [r"litespeed", r"lscwp"]},
    "jQuery": {"cat": "JS Library", "patterns": [r"jquery(?:\.min)?\.js"]},
    "Bootstrap": {"cat": "CSS Framework", "patterns": [r"bootstrap(?:\.min)?\.(?:css|js)"]},
    "Font Awesome": {"cat": "Icons", "patterns": [r"font-?awesome"]},
    "Google Analytics": {"cat": "Analytics", "patterns": [r"google-analytics\.com"]},
    "Google Tag Manager": {"cat": "Analytics", "patterns": [r"googletagmanager\.com"]},
    "Cloudflare": {"cat": "CDN / Security", "patterns": [r"cloudflare"]},
}


class WordPressDetector:
    """Detects WordPress sites and their technologies"""

    # --- Response classification -------------------------------------------
    # HTTP codes that almost always mean "firewall / anti-bot / auth
    # challenge" - NEVER "this site is not WordPress".
    BLOCK_STATUSES = {401, 403, 405, 406, 429, 451, 503}

    # Phrases shown by a firewall or bot-protection page (checked in <head>)
    BLOCK_BODY_MARKERS = [
        "just a moment", "attention required", "checking your browser",
        "verify you are human", "human verification", "are you a robot",
        "your request has been blocked", "request has been blocked",
        "firewall block", "ddos protection", "cdn-cgi/challenge",
        "enable javascript and cookies",
        "checking if the site connection is secure",
        "why have i been blocked", "security verification",
        "cf-browser-verification", "ddos-guard",
        "performing a security verification", "restricted your access",
    ]

    BLOCK_TITLE_MARKERS = [
        "just a moment", "attention required", "access denied",
        "human verification", "your request has been blocked",
        "request has been blocked", "security check",
        "security verification", "captcha", "firewall block",
    ]

    # WordPress fingerprints: ONE hit is enough to say "WordPress"
    WP_STRONG_MARKERS = [
        "wp-content", "wp-includes", "/wp-content/uploads",
        "powered by wordpress",
    ]

    # Weaker fingerprints (may appear in articles too): at least TWO needed
    WP_WEAK_MARKERS = [
        "/wp-json/", "api.w.org", "wp-emoji", "xmlrpc.php",
        "/wp-admin/", "wp-cron.php", "wlwmanifest.xml", "wp-block-",
    ]

    def __init__(self, timeout=30, max_workers=5, max_retries=1):
        self.timeout = timeout
        self.max_workers = max_workers
        self.max_retries = max_retries
        self.results = {
            "wordpress": [], "not_wordpress": [], "errors": [], "blocked": []
        }
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/124.0.0.0 Safari/537.36"
        }

    def _build_url_variants(self, url):
        """Build https + http variants (https is tried first, then http).

        This ensures sites without a valid SSL certificate (or where
        https simply does not respond) are still checked over plain http.
        """
        url = (url or "").strip()
        if not url:
            return []

        # Strip any existing scheme so we can rebuild both variants
        if "://" in url:
            stripped = url.split("://", 1)[1]
        else:
            stripped = url
        stripped = stripped.rstrip("/")

        # Validate the host contains a dot (e.g. example.com)
        try:
            parsed = urlparse("https://" + stripped)
            if not parsed.netloc or "." not in parsed.netloc:
                return []
        except Exception:
            return []

        return [f"https://{stripped}", f"http://{stripped}"]

    def detect_technologies(self, html, soup, headers_resp):
        """Detect technologies from HTML source (WordPress sites only)"""
        detected = {}
        html_lower = html.lower()

        # 1. Server headers
        server = headers_resp.get("Server")
        if server:
            detected[f"Server: {server}"] = "Web Server"

        powered_by = headers_resp.get("X-Powered-By")
        if powered_by:
            detected[f"Powered By: {powered_by}"] = "Server Technology"

        # 2. Meta generator
        gen = soup.find("meta", attrs={"name": re.compile(r"generator", re.I)})
        if gen and gen.get("content"):
            detected[f"Generator: {gen['content']}"] = "CMS / Builder"

        # 3. Pattern signatures
        for tech, rule in SIGNATURES.items():
            for pattern in rule.get("patterns", []):
                if re.search(pattern, html_lower):
                    detected[tech] = rule.get("cat", "Other")
                    break

        return detected

    # --- Fetching ---------------------------------------------------------
    @staticmethod
    def _is_dns_failure(message):
        m = (message or "").lower()
        return any(k in m for k in (
            "nameresolutionerror", "getaddrinfo", "name or service not known",
            "nodename nor servname", "no address associated",
            "name resolution",
        ))

    @staticmethod
    def _describe_error(exc):
        """Turn a requests exception into a useful, specific message."""
        raw = str(exc)
        low = raw.lower()
        if WordPressDetector._is_dns_failure(raw):
            return "Domain not found (DNS record missing)"
        if "timed out" in low or "read timeout" in low:
            return "Timeout (no response)"
        if "reset by peer" in low or "forcibly closed" in low or "10054" in low:
            return "Connection reset by server"
        if "refused" in low:
            return "Connection refused"
        if "certificate" in low or "ssl" in low or "handshake" in low:
            return "SSL/TLS error"
        return raw[:120] or exc.__class__.__name__

    def _fetch(self, url):
        """GET a URL.

        Returns ``(response, error_message, dns_failed)``.  Fast failures
        (connection reset / refused) are retried once, because a single
        flaky handshake must not push a healthy site into the error list.
        Timeouts and DNS errors are not retried - the caller moves on to
        the next protocol variant instead.
        """
        last_error = "Unknown error"
        dns_failed = False
        attempts = self.max_retries + 1

        for i in range(attempts):
            try:
                resp = requests.get(
                    url, headers=self.headers, timeout=self.timeout,
                    allow_redirects=True, verify=False,
                )
                return resp, None, False
            except requests.exceptions.Timeout:
                # Retry: slow servers (common on cheap shared hosting) often
                # answer on the second attempt. NOT a permanent failure.
                last_error = f"Timeout (no response in {self.timeout}s)"
            except requests.exceptions.SSLError:
                # Retry: TLS handshakes are flaky on many Iranian hosts.
                last_error = "SSL/TLS handshake error"
            except requests.exceptions.ConnectionError as e:
                last_error = self._describe_error(e)
                if self._is_dns_failure(str(e)):
                    dns_failed = True
                    break
            except Exception as e:  # noqa: BLE001
                last_error = str(e)[:80]
                break

            if i < attempts - 1:
                time.sleep(0.7)

        return None, last_error, dns_failed

    # --- Classification ----------------------------------------------------
    def _is_block_page(self, resp, html_lower):
        """True when the response is a firewall / bot-challenge page and
        NOT the real website (so it must never mean 'not WordPress')."""
        if resp.headers.get("Cf-Mitigated"):
            return True
        if resp.status_code in self.BLOCK_STATUSES:
            return True

        head = html_lower[:4000]
        for marker in self.BLOCK_BODY_MARKERS:
            if marker in head:
                return True

        title = re.search(r"<title[^>]*>(.*?)</title>", head, re.S | re.I)
        if title:
            text = title.group(1)
            for marker in self.BLOCK_TITLE_MARKERS:
                if marker in text:
                    return True
        return False

    @staticmethod
    def _header_evidence(resp):
        """WordPress fingerprints living in headers / cookies / redirect."""
        found = []
        link = resp.headers.get("Link") or ""
        if "api.w.org" in link:
            found.append("Link header (api.w.org)")
        if "wordpress" in (resp.headers.get("X-Redirect-By") or "").lower():
            found.append("X-Redirect-By: WordPress")
        if "wordpress" in (resp.headers.get("X-Powered-By") or "").lower():
            found.append("X-Powered-By: WordPress")
        try:
            names = list(resp.cookies.get_dict())
        except Exception:  # noqa: BLE001
            names = []
        for name in names:
            if name.startswith(("wordpress_", "wp-settings",
                                "comment_author")):
                found.append(f"Cookie: {name}")
        return found

    def _wp_evidence(self, resp, soup, html_lower):
        """All the reasons we have to call this page WordPress.

        Header/cookie evidence is conclusive on its own (it works even on a
        firewall page).  In the HTML, one strong marker is enough; weak
        markers (which can appear in ordinary articles) need two hits.
        """
        evidence = self._header_evidence(resp)
        if evidence:
            return evidence

        final_url = (resp.url or "").lower()
        if "/wp-login" in final_url or "/wp-admin" in final_url:
            return ["redirected to wp-admin / wp-login"]

        for marker in self.WP_STRONG_MARKERS:
            if marker in html_lower:
                evidence.append(marker)

        gen = soup.find("meta", attrs={"name": re.compile(r"generator", re.I)})
        if gen and gen.get("content") and "wordpress" in gen["content"].lower():
            evidence.append("generator meta")

        if not evidence:
            weak = [m for m in self.WP_WEAK_MARKERS if m in html_lower]
            if len(weak) >= 2:
                evidence.extend(weak)

        seen = set()
        unique = []
        for item in evidence:
            if item not in seen:
                seen.add(item)
                unique.append(item)
        return unique

    def _wp_rest_probe(self, base_url):
        """Conclusive WordPress fallback: the REST API index.

        Some WordPress sites use a theme that strips EVERY fingerprint
        from the homepage HTML (no wp-content links, no generator meta, no
        wp-includes).  For those sites ``/wp-json/`` - or
        ``?rest_route=/`` on ugly-permalink installs - is the most reliable
        proof available: it is served by WordPress core itself and always
        lists the ``/wp/v2`` routes.

        This probe also reaches sites whose homepage sits behind a WAF /
        anti-bot challenge, because the REST index is usually NOT firewalled.

        Returns a list of evidence strings (empty list = not WordPress).
        """
        base = (base_url or "").rstrip("/")
        if not base:
            return []

        candidates = [f"{base}/wp-json/", f"{base}/?rest_route=/"]
        probe_timeout = min(self.timeout, 15)

        for candidate in candidates:
            try:
                resp = requests.get(
                    candidate, headers=self.headers,
                    timeout=probe_timeout, allow_redirects=True, verify=False,
                )
                if resp.status_code != 200:
                    continue
                body = resp.text[:200000]
                if '"routes"' not in body and '"namespaces"' not in body:
                    continue
                if '"/wp/v2"' in body or '"wp/' in body:
                    return [f"REST API index ({candidate})"]
            except Exception:  # noqa: BLE001
                continue
        return []

    def check_wordpress(self, url):
        """Check if a URL is WordPress and detect its technologies.

        Tries https first; if that fails (SSL error, refused, timeout),
        falls back to plain http so sites without SSL are not missed.

        A page sitting behind a firewall / bot challenge (403, Cloudflare
        'Just a moment', 'Your request has been blocked', ...) is NEVER
        reported as 'not WordPress' - it goes to its own `blocked` bucket,
        because that answer only means "we could not read the page".
        """
        variants = self._build_url_variants(url)
        if not variants:
            return {"url": url, "status": "error",
                    "message": "Invalid URL (needs a valid domain)"}

        state = {
            "last_error": "Unknown error",
            "dns_failure": False,
            "got_response": False,
            "blocked_wp": None,   # blocked page that still proved WordPress
            "blocked": None,      # blocked page, WordPress status unknown
        }

        def build_result(variant, resp, html, soup, methods):
            title_tag = soup.find("title")
            return {
                "url": variant,
                "is_wordpress": bool(methods),
                "methods": methods,
                "technologies": {},
                "final_url": resp.url,
                "status_code": resp.status_code,
                "protocol": variant.split("://", 1)[0],
                "redirected": (resp.url.rstrip("/") != variant.rstrip("/")),
                "response_time_ms": round(resp.elapsed.total_seconds() * 1000),
                "content_length": len(html),
                "page_title": (title_tag.get_text(strip=True)[:150]
                               if title_tag else None),
                "response_headers": dict(resp.headers),
            }

        def scan(candidates):
            for variant in candidates:
                resp, error, dns = self._fetch(variant)
                if resp is None:
                    state["last_error"] = error
                    state["dns_failure"] = state["dns_failure"] or dns
                    continue
                state["got_response"] = True

                html = resp.text
                html_lower = html.lower()
                soup = BeautifulSoup(html, "html.parser")
                methods = self._wp_evidence(resp, soup, html_lower)

                if self._is_block_page(resp, html_lower):
                    entry = (variant, resp, html, soup, methods)
                    if methods and state["blocked_wp"] is None:
                        state["blocked_wp"] = entry
                    elif not methods and state["blocked"] is None:
                        state["blocked"] = entry
                    # keep trying the other protocol for a readable page
                    continue

                if resp.status_code >= 500:
                    state["last_error"] = (
                        f"Server error (HTTP {resp.status_code})"
                    )
                    continue

                # Readable response (2xx / 3xx / normal 4xx): real verdict.
                result = build_result(variant, resp, html, soup, methods)
                if methods:
                    result["status"] = "wordpress"
                    # Detect technologies ONLY for WordPress sites
                    result["technologies"] = self.detect_technologies(
                        html, soup, resp.headers
                    )
                    result["tech_count"] = len(result["technologies"])
                else:
                    # Homepage HTML shows NO WordPress fingerprint.  Some
                    # themes strip all of them, so fall back to the REST API
                    # index before deciding this is not WordPress.
                    probe = self._wp_rest_probe(variant)
                    if probe:
                        result["methods"] = probe
                        result["status"] = "wordpress"
                        result["technologies"] = self.detect_technologies(
                            html, soup, resp.headers
                        )
                        result["tech_count"] = len(result["technologies"])
                    else:
                        result["status"] = "not_wordpress"
                return result
            return None

        result = scan(variants)
        if result:
            return result

        # The bare domain does not resolve at all -> one cheap last try with
        # a 'www.' prefix (many sites only publish a record for www.domain).
        if state["dns_failure"] and not state["got_response"]:
            host = variants[0].split("://", 1)[1]
            if not host.lower().startswith("www."):
                result = scan([f"https://www.{host}", f"http://www.{host}"])
                if result:
                    return result

        # Firewall page, but WordPress proved by headers / redirect / HTML
        if state["blocked_wp"]:
            variant, resp, html, soup, methods = state["blocked_wp"]
            result = build_result(variant, resp, html, soup, methods)
            result.update({
                "status": "wordpress",
                "blocked": True,
                "note": (f"Firewall / anti-bot challenge (HTTP "
                         f"{resp.status_code}): technologies could not be "
                         f"scanned, WordPress confirmed from response "
                         f"fingerprints."),
                "technologies": {},
                "tech_count": 0,
            })
            return result

        # Firewall page, nothing to identify it with -> unknown, not 'non-WP'
        if state["blocked"]:
            variant, resp, html, soup, methods = state["blocked"]
            # Last chance: the REST API index is usually NOT behind the WAF,
            # so a blocked homepage can still be proven WordPress.  Without
            # this probe, healthy WordPress sites behind a firewall would be
            # wrongly dropped from the pipeline.
            probe = self._wp_rest_probe(variant)
            if probe:
                result = build_result(variant, resp, html, soup, probe)
                result.update({
                    "status": "wordpress",
                    "blocked": True,
                    "note": (f"Firewall / anti-bot challenge (HTTP "
                             f"{resp.status_code}) on the homepage; WordPress "
                             f"confirmed from the REST API index. "
                             f"Technologies could not be scanned."),
                    "technologies": {},
                    "tech_count": 0,
                })
                return result

            title_tag = soup.find("title")
            return {
                "url": variant,
                "status": "blocked",
                "http_status": resp.status_code,
                "final_url": resp.url,
                "page_title": (title_tag.get_text(strip=True)[:150]
                               if title_tag else None),
                "message": (f"Blocked by firewall / anti-bot protection "
                            f"(HTTP {resp.status_code}) - cannot determine "
                            f"if it is WordPress. Open it in a browser to "
                            f"check manually."),
            }

        # Every variant failed
        return {"url": variants[0], "status": "error",
                "message": state["last_error"]}

    def check_all(self, urls, callback=None):
        """Check multiple URLs in parallel"""
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {executor.submit(self.check_wordpress, u): u for u in urls}
            for future in as_completed(futures):
                result = future.result()

                if result["status"] == "wordpress":
                    self.results["wordpress"].append(result)
                elif result["status"] == "error":
                    self.results["errors"].append(result)
                elif result["status"] == "blocked":
                    self.results.setdefault("blocked", []).append(result)
                else:
                    self.results["not_wordpress"].append(result)

                if callback:
                    callback(result)

        return self.results

    def save_json(self, filename=None):
        """Save a comprehensive JSON report for WordPress sites only."""
        if not filename:
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = os.path.join(BASE_DIR, f"wp_results_{stamp}.json")

        # --- Technology statistics (how many sites use each tech) ---
        tech_stats = {}
        for site in self.results["wordpress"]:
            for tech, cat in site.get("technologies", {}).items():
                entry = tech_stats.setdefault(tech, {"category": cat, "sites": 0})
                entry["sites"] += 1
        tech_stats = dict(
            sorted(tech_stats.items(), key=lambda kv: kv[1]["sites"], reverse=True)
        )

        # --- Full per-site details ---
        wp_sites = []
        for i, site in enumerate(self.results["wordpress"], 1):
            wp_sites.append({
                "id": i,
                "url": site["url"],
                "final_url": site.get("final_url"),
                "redirected": site.get("redirected"),
                "protocol": site.get("protocol"),
                "status_code": site.get("status_code"),
                "page_title": site.get("page_title"),
                "response_time_ms": site.get("response_time_ms"),
                "content_length": site.get("content_length"),
                "is_wordpress": True,
                "detection_methods": site.get("methods", []),
                "response_headers": site.get("response_headers", {}),
                "tech_count": site.get("tech_count", 0),
                "technologies": site.get("technologies", {}),
            })

        total = sum(len(v) for v in self.results.values())
        wp_count = len(self.results["wordpress"])

        data = {
            "report": {
                "type": "WordPress Sites - Comprehensive Report",
                "generator": "WordPress Detector Pro v3.0",
                "scan_date": datetime.now().isoformat(),
                "detector_config": {
                    "timeout_seconds": self.timeout,
                    "max_workers": self.max_workers,
                },
            },
            "summary": {
                "total_urls_checked": total,
                "wordpress_sites": wp_count,
                "non_wordpress": len(self.results["not_wordpress"]),
                "blocked_sites": len(self.results.get("blocked", [])),
                "errors": len(self.results["errors"]),
                "wordpress_rate_percent": round(wp_count * 100 / total, 1) if total else 0,
                "total_technologies_found": len(tech_stats),
            },
            "technology_statistics": tech_stats,
            "wordpress_sites": wp_sites,
            "blocked_sites": [
                {
                    "url": b.get("url"),
                    "http_status": b.get("http_status"),
                    "final_url": b.get("final_url"),
                    "page_title": b.get("page_title"),
                    "reason": b.get("message"),
                }
                for b in self.results.get("blocked", [])
            ],
        }

        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return filename

    def save_txt(self, filename=None):
        """Save WordPress sites (with tech) to readable text"""
        if not filename:
            stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = os.path.join(BASE_DIR, f"wp_sites_{stamp}.txt")

        with open(filename, "w", encoding="utf-8") as f:
            f.write(f"WordPress Sites Report - {datetime.now():%Y-%m-%d %H:%M:%S}\n")
            f.write("=" * 60 + "\n\n")

            for i, site in enumerate(self.results["wordpress"], 1):
                f.write(f"[{i}] {site['url']}\n")
                if site.get("final_url") and site["final_url"] != site["url"]:
                    f.write(f"     -> {site['final_url']}\n")

                techs = site.get("technologies", {})
                if techs:
                    f.write("     Technologies:\n")
                    for name, cat in techs.items():
                        f.write(f"       - {name}  ({cat})\n")
                f.write("\n")

        return filename
