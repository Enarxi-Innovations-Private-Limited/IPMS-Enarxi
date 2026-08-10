"""
Robu Automation Module
Handles product search, price extraction, and adding to cart from Robu website.
"""
from playwright.sync_api import Page, BrowserContext
from typing import Dict, Optional, List
import time
import os
import json
from datetime import datetime
import re
from urllib.parse import quote_plus


def log_action(message: str):
    """Log action with timestamp."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🔍 ROBU: {message}")


class RobuScraper:
    def __init__(self):
        self.base_url = "https://robu.in"
        self.timeout = 60000
        self.debug_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "output", "robu_debug")
        os.makedirs(self.debug_dir, exist_ok=True)

    def _dismiss_robu_popups(self, page: Page):
        try:
            from automation.cart import CartAutomation
            CartAutomation()._dismiss_popups(page)
        except Exception:
            pass

    def _goto_with_retry(
        self,
        page: Page,
        url: str,
        label: str,
        attempts: int = 2,
        timeout: Optional[int] = None,
    ) -> bool:
        nav_timeout = timeout or self.timeout
        last_error = None
        for attempt in range(1, attempts + 1):
            try:
                log_action(f"Navigating to {label} (attempt {attempt}/{attempts}): {url}")
                page.goto(url, wait_until="domcontentloaded", timeout=nav_timeout)
                self._dismiss_robu_popups(page)
                return True
            except Exception as exc:
                last_error = exc
                log_action(f"⚠️ Navigation failed for {label} (attempt {attempt}/{attempts}): {exc}")
                try:
                    page.wait_for_timeout(1500 * attempt)
                except Exception:
                    pass
        if last_error:
            log_action(f"❌ Unable to load {label}: {last_error}")
        return False

    def _extract_price_value(self, text: str) -> Optional[float]:
        if not text:
            return None
        normalized = text.replace(",", "")
        match = re.search(r"(?:₹|â‚¹|Rs\.?)\s*([\d]+(?:\.\d+)?)", normalized, re.IGNORECASE)
        if not match:
            return None
        try:
            value = float(match.group(1))
            return value if value > 0 else None
        except ValueError:
            return None

    def _candidate_score(self, sku: str, candidate: Dict[str, str]) -> int:
        sku_text = str(sku).strip().lower()
        href = candidate.get("href", "").lower()
        text = candidate.get("text", "").lower()
        slug = href.rstrip("/").split("/product/")[-1] if "/product/" in href else href.rstrip("/").split("/")[-1]
        compact_sku = re.sub(r"[^a-z0-9]", "", sku_text)
        compact_text = re.sub(r"[^a-z0-9]", "", text)
        compact_slug = re.sub(r"[^a-z0-9]", "", slug)

        score = 0
        if not sku_text:
            return score
        if sku_text in href:
            score += 60
        if sku_text in text:
            score += 50
        if compact_sku and compact_sku == compact_slug:
            score += 90
        elif compact_sku and compact_sku in compact_slug:
            score += 70
        if compact_sku and compact_sku == compact_text:
            score += 80
        elif compact_sku and compact_sku in compact_text:
            score += 45
        if text.startswith(str(sku).strip().lower()):
            score += 25
        return score

    def _wait_for_product_ready(self, page: Page) -> Dict[str, bool]:
        checks = {
            "summary": [".entry-summary", ".summary", ".product-summary", "div.product"],
            "price": [".entry-summary .price", ".summary .price", ".product-summary .price", ".woocommerce-Price-amount"],
            "quantity": ["input[name='quantity']", "input.qty"],
            "cart_button": ["button.single_add_to_cart_button", "button.product-button", "[name='add-to-cart']"],
            "bulk_table": ["table.pro_bulk_pricing_table", ".bulk-pricing table", "table:has(tr:has-text('Quantity'))", "table:has(tr:has-text('MOQ'))"],
        }
        readiness = {key: False for key in checks}
        deadline = time.time() + 12

        while time.time() < deadline:
            self._dismiss_robu_popups(page)
            for key, selectors in checks.items():
                if readiness[key]:
                    continue
                for selector in selectors:
                    try:
                        loc = page.locator(selector).first
                        if loc.count() > 0 and loc.is_visible(timeout=300):
                            readiness[key] = True
                            break
                    except Exception:
                        continue
            if readiness["summary"] and (readiness["price"] or readiness["quantity"] or readiness["cart_button"] or readiness["bulk_table"]):
                break
            try:
                page.wait_for_timeout(500)
            except Exception:
                break

        log_action("Product readiness -> " + ", ".join(f"{key}={value}" for key, value in readiness.items()))
        return readiness

    def _capture_debug_snapshot(self, page: Page, sku: str, stage: str, extra: Optional[Dict] = None):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe_sku = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(sku or "unknown"))[:80]
        base = os.path.join(self.debug_dir, f"{timestamp}_{safe_sku}_{stage}")
        payload = {
            "sku": sku,
            "stage": stage,
            "url": page.url,
            "extra": extra or {},
        }
        try:
            payload["title"] = page.title()
        except Exception:
            payload["title"] = None
        try:
            payload["summary_html"] = page.evaluate(
                """() => {
                    const selectors = ['.entry-summary', '.summary', '.product-summary', 'div.product'];
                    for (const selector of selectors) {
                        const node = document.querySelector(selector);
                        if (node) return node.outerHTML;
                    }
                    return document.body ? document.body.innerHTML.slice(0, 12000) : '';
                }"""
            )
        except Exception as exc:
            payload["summary_html_error"] = str(exc)
        try:
            payload["body_text_excerpt"] = page.evaluate("() => (document.body?.innerText || '').slice(0, 4000)")
        except Exception as exc:
            payload["body_text_error"] = str(exc)
        try:
            page.screenshot(path=f"{base}.png", full_page=True)
        except Exception as exc:
            payload["screenshot_error"] = str(exc)
        with open(f"{base}.json", "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, ensure_ascii=False)
        log_action(f"Saved ROBU debug snapshot: {base}")

    def _collect_product_candidates(self, page: Page, dropdown_only: bool = False) -> List[Dict[str, str]]:
        candidates = []
        seen_hrefs = set()
        selectors = (
            [
                ".dgwt-wcas-suggestions-wrp a[href*='/product/']",
                ".aws-search-result a[href*='/product/']",
                ".live-search-results a[href*='/product/']",
                ".autocomplete-suggestions a[href*='/product/']",
                "[class*='suggestion'] a[href*='/product/']",
                "[class*='dropdown'] a[href*='/product/']",
            ]
            if dropdown_only
            else [
                ".products a[href*='/product/']",
                ".product a[href*='/product/']",
                "li.product a[href*='/product/']",
                "main a[href*='/product/']",
                "a[href*='/product/']",
            ]
        )

        for selector in selectors:
            try:
                links = page.locator(selector)
                count = links.count()
            except Exception:
                continue

            for index in range(count):
                try:
                    link = links.nth(index)
                    if dropdown_only and not link.is_visible(timeout=200):
                        continue
                    href = (link.get_attribute("href") or "").strip()
                    text = link.inner_text().strip()
                    if not href or "/product/" not in href or len(text) < 3:
                        continue
                    full_href = href if href.startswith("http") else f"{self.base_url}{href}"
                    if full_href in seen_hrefs:
                        continue
                    seen_hrefs.add(full_href)
                    candidates.append({"href": full_href, "text": text})
                except Exception:
                    continue
        return candidates

    def _verify_candidate_product(self, page: Page, sku: str, candidates: List[Dict[str, str]]) -> Dict:
        ranked = sorted(candidates, key=lambda item: self._candidate_score(sku, item), reverse=True)
        sku_lower = str(sku).strip().lower()

        for candidate in ranked[:8]:
            try:
                log_action(f"Verifying candidate product: {candidate['href']}")
                page.goto(candidate["href"], wait_until="domcontentloaded", timeout=self.timeout)
                self._dismiss_robu_popups(page)
                self._wait_for_product_ready(page)
                time.sleep(1.0)
                body_text = page.evaluate("() => document.body.innerText")
                if self._candidate_score(sku, candidate) > 0 or sku_lower in body_text.lower():
                    log_action(f"✅ Verified ROBU product page for SKU {sku}: {candidate['href']}")
                    return {"sku": sku, "product_url": page.url, "found": True}
            except Exception as exc:
                log_action(f"Fallback candidate failed: {exc}")
        return {"sku": sku, "found": False, "reason": f"Unable to verify any ROBU candidate page for SKU {sku}"}

    def search_product(self, page: Page, sku: str) -> Dict:
        try:
            log_action(f"Starting search for SKU: {sku}")
            homepage_ready = "robu.in" in page.url or self._goto_with_retry(page, self.base_url, "Robu homepage")
            direct_search_url = f"{self.base_url}/?s={quote_plus(str(sku).strip())}&post_type=product"

            if not homepage_ready:
                log_action("⚠️ Homepage unavailable, falling back to direct ROBU search results")
                if not self._goto_with_retry(page, direct_search_url, "Robu direct search results"):
                    return {"sku": sku, "found": False, "reason": "ROBU homepage timed out and direct search results also failed to load"}

            self._dismiss_robu_popups(page)
            page.evaluate("window.scrollTo(0, 0)")

            search_input = None
            search_selectors = [
                ".dgwt-wcas-search-input",
                "input[placeholder*='Search']",
                "input[placeholder*='search']",
                ".search-box input",
                "input[id*='search']",
            ]
            for selector in search_selectors:
                try:
                    page.wait_for_selector(selector, timeout=3000)
                    loc = page.locator(selector).first
                    if loc.count() > 0 and loc.is_visible(timeout=1500):
                        search_input = loc
                        log_action(f"✅ Found search input ({'primary' if selector == search_selectors[0] else 'fallback'}): {selector}")
                        break
                except Exception:
                    continue

            if not search_input or search_input.count() == 0:
                log_action("⚠️ Search input not found on homepage, switching to direct ROBU search results")
                if not self._goto_with_retry(page, direct_search_url, "Robu direct search results"):
                    return {"sku": sku, "found": False, "reason": "ROBU search input was unavailable and direct search results failed to load"}
                candidates = self._collect_product_candidates(page, dropdown_only=False)
                if candidates:
                    return self._verify_candidate_product(page, sku, candidates)
                return {"sku": sku, "found": False, "reason": f"No ROBU search results found for SKU {sku}"}

            log_action(f"📝 Typing SKU: {sku}")
            search_input.click()
            page.keyboard.press("Control+A")
            page.keyboard.press("Backspace")
            search_input.type(str(sku), delay=30)
            log_action(f"✅ Typed: {sku} - waiting for dropdown...")
            time.sleep(2)

            log_action("⏳ Waiting for dropdown container...")
            time.sleep(2)
            dropdown_candidates = self._collect_product_candidates(page, dropdown_only=True)
            log_action(f"🔍 Found {len(dropdown_candidates)} dropdown-scoped links with /product/")

            ranked_dropdown = sorted(dropdown_candidates, key=lambda item: self._candidate_score(sku, item), reverse=True)
            if ranked_dropdown and self._candidate_score(sku, ranked_dropdown[0]) > 0:
                log_action(f"✅ Using best dropdown candidate: {ranked_dropdown[0]['text'][:80]}")
                return self._verify_candidate_product(page, sku, ranked_dropdown[:5])

            log_action("⚠️ Dropdown candidates were noisy or unverified — switching to direct ROBU search results")
            try:
                page.keyboard.press("Enter")
            except Exception:
                pass
            if page.url == self.base_url or "/?s=" not in page.url:
                self._goto_with_retry(page, direct_search_url, "Robu direct search results", attempts=1, timeout=15000)
            try:
                page.wait_for_load_state("domcontentloaded", timeout=8000)
            except Exception:
                pass

            candidate_links = self._collect_product_candidates(page, dropdown_only=False)
            if candidate_links:
                return self._verify_candidate_product(page, sku, candidate_links)

            self._capture_debug_snapshot(page, sku, "dropdown_noise", {"reason": "no_verified_candidate"})
            return {"sku": sku, "found": False, "reason": f"ROBU dropdown/search results did not yield a verified match for SKU {sku}"}
        except Exception as exc:
            log_action(f"Search error: {exc}")
            return {"sku": sku, "found": False, "reason": f"ROBU search error: {exc}"}

    def extract_price(self, page: Page, product_url: str, quantity: int, sku: str = "") -> Dict:
        try:
            if page.url != product_url:
                page.goto(product_url, wait_until="domcontentloaded", timeout=self.timeout)
            self._dismiss_robu_popups(page)
            readiness = self._wait_for_product_ready(page)
            page.evaluate("window.scrollTo(0, 400)")
            log_action("⏳ Waiting for pricing table to render...")
            try:
                page.wait_for_selector(
                    "table.pro_bulk_pricing_table, .bulk-pricing table, "
                    "table:has(tr:has-text('Quantity')), table:has(tr:has-text('MOQ'))",
                    timeout=6000,
                )
                log_action("✅ Pricing table detected")
            except Exception:
                log_action("⚠️ No pricing table found within 6s — will try base price")
            time.sleep(1)

            def _detect_stock_limit(page_ref, qty_requested, sku_val):
                for sel in [
                    ".woocommerce-error li",
                    ".woocommerce-notices-wrapper .woocommerce-error",
                    ".stock.out-of-stock",
                    ".stock.low-stock",
                    ".woocommerce-error",
                ]:
                    try:
                        loc = page_ref.locator(sel).first
                        if loc.count() > 0 and loc.is_visible(timeout=1500):
                            msg = loc.inner_text().strip()
                            m = re.search(r"only\s*(\d+)\s*(?:units?|items?)?\s*(?:are\s*)?available", msg, re.IGNORECASE)
                            if m:
                                available = int(m.group(1))
                                log_action(f"⚠️ Stock notice [{sel}]: '{msg}' — available: {available}, need: {qty_requested}")
                                if available < qty_requested:
                                    return {
                                        "sku": sku_val,
                                        "found": True,
                                        "error": "Insufficient Stock",
                                        "message": msg,
                                        "available": available,
                                        "out_of_stock": True,
                                    }
                            if "out of stock" in msg.lower():
                                return {"sku": sku_val, "found": False, "error": "Out of Stock", "out_of_stock": True}
                    except Exception:
                        continue
                try:
                    body_text = page_ref.evaluate("() => document.body.innerText")
                    m2 = re.search(r"only\s*(\d+)\s*(?:units?|items?)?\s*(?:are\s*)?available", body_text, re.IGNORECASE)
                    if m2:
                        available = int(m2.group(1))
                        if available < qty_requested:
                            return {
                                "sku": sku_val,
                                "found": True,
                                "error": "Insufficient Stock",
                                "message": f"Only {available} units available.",
                                "available": available,
                                "out_of_stock": True,
                            }
                except Exception:
                    pass
                return None

            stock_result = _detect_stock_limit(page, quantity, sku)
            if stock_result:
                return stock_result

            try:
                page.evaluate(
                    """(qty) => {
                        const input = document.querySelector("input[name='quantity'], input.qty");
                        if (input) {
                            input.value = qty;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }""",
                    quantity,
                )
                time.sleep(1.5)
            except Exception:
                pass

            stock_result = _detect_stock_limit(page, quantity, sku)
            if stock_result:
                return stock_result

            def _fetch_robu_base_price():
                summary_selectors = [
                    ".entry-summary .price",
                    ".summary .price",
                    ".product-summary .price",
                    ".summary p.price",
                    ".entry-summary .woocommerce-Price-amount",
                    ".summary .woocommerce-Price-amount",
                ]
                for sel in summary_selectors:
                    try:
                        txt = page.locator(sel).first.inner_text(timeout=1500).strip()
                        if "incl" in txt.lower() and "gst" in txt.lower():
                            val = self._extract_price_value(txt)
                            if val is not None:
                                log_action(f"[base price] CSS match '{sel}' -> ₹{val}")
                                return val
                        val = self._extract_price_value(txt)
                        if val is not None:
                            log_action(f"[base price] relaxed CSS match '{sel}' -> ₹{val}")
                            return val
                    except Exception:
                        continue
                try:
                    body_text = page.evaluate("() => document.body.innerText")
                    m = re.search(r"(?:₹|â‚¹|Rs\.?)\s*([\d,]+\.?\d*)\s*\(\s*Incl\.?\s*GST\s*\)", body_text, re.IGNORECASE)
                    if m:
                        val = float(m.group(1).replace(",", ""))
                        if val > 0:
                            log_action(f"[base price] body-text match -> ₹{val}")
                            return val
                except Exception:
                    pass
                for sel in [".entry-summary", ".summary", ".product-summary", "form.cart", "div.product"]:
                    try:
                        txt = page.locator(sel).first.inner_text(timeout=1500).strip()
                        val = self._extract_price_value(txt)
                        if val is not None:
                            log_action(f"[base price] summary text match '{sel}' -> ₹{val}")
                            return val
                    except Exception:
                        continue
                try:
                    script_value = page.evaluate(
                        """() => {
                            const scripts = Array.from(document.querySelectorAll("script[type='application/ld+json']"));
                            for (const script of scripts) {
                                const text = script.textContent || "";
                                const match = text.match(/"price"\\s*:\\s*"?(\\d+(?:\\.\\d+)?)"?/i);
                                if (match) return match[1];
                            }
                            return null;
                        }"""
                    )
                    if script_value:
                        val = float(script_value)
                        if val > 0:
                            log_action(f"[base price] ld+json match -> ₹{val}")
                            return val
                except Exception:
                    pass
                return None

            target_rows = []
            all_tables = []
            try:
                table_selectors = [
                    ".entry-summary table",
                    ".summary table",
                    ".product-summary table",
                    ".woocommerce-product-details__short-description table",
                    "table.pro_bulk_pricing_table",
                    ".bulk-pricing table",
                    "table",
                ]
                for selector in table_selectors:
                    try:
                        all_tables.extend(page.locator(selector).all())
                    except Exception:
                        continue
                log_action(f"Scanning {len(all_tables)} tables for pricing table...")
                for table in all_tables:
                    try:
                        table_text = table.inner_text().lower()
                        has_qty = any(kw in table_text for kw in ["quantity", "qty", "moq"])
                        has_price = any(kw in table_text for kw in ["price", "₹", "â‚¹", "rs."])
                        if has_qty and has_price:
                            target_rows = table.locator("tr").all()
                            log_action(f"✅ Found correct pricing table ({len(target_rows)} rows)")
                            break
                    except Exception:
                        continue
                if not target_rows:
                    page.wait_for_timeout(2500)
                    target_rows = page.locator(
                        ".woocommerce-product-details__short-description li, "
                        ".entry-summary li, .summary li"
                    ).all()
                    if target_rows:
                        log_action(f"Using summary-list fallback ({len(target_rows)} items)")
                log_action(f"Extracting pricing tiers from {len(target_rows)} rows")
            except Exception as exc:
                log_action(f"Tier extraction setup failed: {exc}")

            tier_prices = []
            try:
                for row in target_rows:
                    row_text = row.inner_text().strip().replace(",", "")
                    if not re.search(r"\d", row_text):
                        continue
                    range_match = (
                        re.search(r"(\d+)\s*-\s*(\d+)", row_text)
                        or re.search(r"(\d+)\s*\+", row_text)
                        or re.search(r"(\d+)\s*to\s*(\d+)", row_text, re.IGNORECASE)
                    )
                    if not range_match:
                        continue
                    price = self._extract_price_value(row_text)
                    if price is None:
                        continue
                    min_qty = int(range_match.group(1))
                    tier_prices.append({"min_qty": min_qty, "price": price})
                    log_action(f"Tier found: Qty {min_qty}+ -> ₹{price}")
            except Exception as exc:
                log_action(f"Tier extraction failed: {exc}")

            if tier_prices:
                has_base_tier = any(t["min_qty"] <= 1 for t in tier_prices)
                if not has_base_tier:
                    base_price = _fetch_robu_base_price()
                    if base_price is not None:
                        tier_prices.append({"min_qty": 1, "price": base_price})
                        log_action(f"✅ Injected base price tier: Qty 1+ -> ₹{base_price}")
                tier_prices.sort(key=lambda x: x["min_qty"], reverse=True)
                for tier in tier_prices:
                    if quantity >= tier["min_qty"]:
                        log_action(f"✅ Qty {quantity} matched tier {tier['min_qty']}+ -> ₹{tier['price']}")
                        return {"price": tier["price"], "tier_prices": tier_prices, "currency": "INR"}

            log_action("⚠️ Tier logic exhausted — fetching strict base price (Incl. GST)")
            fallback_price = _fetch_robu_base_price()
            if fallback_price is not None:
                log_action(f"✅ Found base price via fallback: ₹{fallback_price}")
                return {"price": fallback_price, "tier_prices": [], "currency": "INR"}

            self._capture_debug_snapshot(
                page,
                sku,
                "price_missing",
                {
                    "product_url": product_url,
                    "readiness": readiness,
                    "table_count": len(all_tables),
                    "row_count": len(target_rows),
                },
            )
            return {"price": "Not Available", "tier_prices": [], "reason": "summary_price_missing"}
        except Exception as exc:
            log_action(f"Extraction error: {exc}")
            try:
                self._capture_debug_snapshot(page, sku, "extract_exception", {"error": str(exc), "product_url": product_url})
            except Exception:
                pass
            return {"price": "Not Available", "tier_prices": [], "reason": f"extract_exception: {exc}"}

    def add_to_cart(self, page: Page, product_url: str, quantity: int) -> bool:
        """Add to cart logic that matches the successful pattern used on other sites."""
        try:
            log_action(f"Adding {quantity} units to cart for: {product_url}")
            if page.url != product_url:
                page.goto(product_url, wait_until="networkidle", timeout=self.timeout)

            time.sleep(2)
            page.evaluate("window.scrollTo(0, 500)")

            qty_input = page.locator("input.qty, input[name='quantity'], .quantity input").first
            if qty_input.count() > 0 and qty_input.is_visible():
                qty_input.click()
                page.keyboard.press("Control+A")
                page.keyboard.press("Backspace")
                time.sleep(0.5)
                qty_input.type(str(int(quantity)), delay=100)
                log_action(f"Filled quantity: {quantity}")

            add_button = page.locator("button.single_add_to_cart_button, .add_to_cart_button, button:has-text('Add to Cart')").first
            if add_button.count() > 0:
                add_button.click(force=True)
                log_action("Clicked Add to Cart button")
                time.sleep(4)
                page.goto("https://robu.in/cart/", wait_until="networkidle")
                time.sleep(3)
                if page.locator(".cart_item, .cart-item, td.product-name").count() > 0:
                    log_action("✅ Item successfully added and verified in cart")
                    return True

            log_action("❌ Could not verify item in cart")
            return False
        except Exception as exc:
            log_action(f"Add to cart error: {exc}")
            return False
