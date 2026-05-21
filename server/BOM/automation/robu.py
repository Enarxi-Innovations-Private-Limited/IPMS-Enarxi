"""
Robu Automation Module
Handles product search, price extraction, and adding to cart from Robu website (SYNC VERSION)
"""
from playwright.sync_api import Page, BrowserContext
from typing import Dict, Optional, List
import random
import time
import os
from datetime import datetime
import re
from urllib.parse import quote_plus

def log_action(message: str):
    """Log action with timestamp"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🔍 ROBU: {message}")

class RobuScraper:
    def __init__(self):
        self.base_url = "https://robu.in"
        self.timeout = 60000

    def _dismiss_robu_popups(self, page: Page):
        try:
            from automation.cart import CartAutomation
            CartAutomation()._dismiss_popups(page)
        except Exception:
            pass

    def _goto_with_retry(self, page: Page, url: str, label: str, attempts: int = 2, timeout: Optional[int] = None) -> bool:
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

    def _collect_product_candidates(self, page: Page) -> List[Dict[str, str]]:
        candidates = []
        seen_hrefs = set()
        selectors = [
            "a[href*='/product/']",
            ".dgwt-wcas-suggestions-wrp a[href*='/product/']",
            ".products a[href*='/product/']",
            ".product a[href*='/product/']",
            "li.product a[href*='/product/']",
        ]

        for selector in selectors:
            try:
                links = page.locator(selector)
                count = links.count()
            except Exception:
                continue

            for index in range(count):
                try:
                    link = links.nth(index)
                    href = (link.get_attribute("href") or "").strip()
                    text = link.inner_text().strip()
                    if not href or "/product/" not in href:
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
        sku_lower = str(sku).strip().lower()

        prioritized = []
        fallback = []
        for candidate in candidates:
            haystack = f"{candidate['href']} {candidate['text']}".lower()
            if sku_lower and sku_lower in haystack:
                prioritized.append(candidate)
            else:
                fallback.append(candidate)

        for candidate in (prioritized + fallback)[:8]:
            try:
                log_action(f"Verifying candidate product: {candidate['href']}")
                page.goto(candidate["href"], wait_until="domcontentloaded", timeout=self.timeout)
                self._dismiss_robu_popups(page)
                time.sleep(1.5)
                body_text = page.evaluate("() => document.body.innerText")
                if sku_lower and sku_lower in body_text.lower():
                    log_action(f"✅ Verified ROBU product page for SKU {sku}: {candidate['href']}")
                    return {"sku": sku, "product_url": page.url, "found": True}
            except Exception as exc:
                log_action(f"Fallback candidate failed: {exc}")
                continue

        return {"sku": sku, "found": False, "reason": f"Unable to verify any ROBU candidate page for SKU {sku}"}

    def search_product(self, page: Page, sku: str) -> Dict:
        try:
            log_action(f"Starting search for SKU: {sku}")

            homepage_ready = "robu.in" in page.url or self._goto_with_retry(page, self.base_url, "Robu homepage")
            direct_search_url = f"{self.base_url}/?s={quote_plus(str(sku).strip())}&post_type=product"

            if not homepage_ready:
                log_action("⚠️ Homepage unavailable, falling back to direct ROBU search results")
                if not self._goto_with_retry(page, direct_search_url, "Robu direct search results"):
                    return {
                        "sku": sku,
                        "found": False,
                        "reason": "ROBU homepage timed out and direct search results also failed to load",
                    }

            self._dismiss_robu_popups(page)

            # Scroll to top to ensure search bar is visible
            page.evaluate("window.scrollTo(0, 0)")

            # ── FAST SEARCH INPUT DETECTION ─────────────────────────────────────
            # Try the primary Robu selector first with a generous timeout.
            # Only fall back to generic selectors if that fails.
            ROBU_SEARCH_SELECTOR = ".dgwt-wcas-search-input"
            search_input = None
            try:
                page.wait_for_selector(ROBU_SEARCH_SELECTOR, timeout=8000)
                loc = page.locator(ROBU_SEARCH_SELECTOR).first
                if loc.count() > 0 and loc.is_visible(timeout=3000):
                    search_input = loc
                    log_action(f"✅ Found search input: {ROBU_SEARCH_SELECTOR}")
            except:
                pass

            # Fallback selectors (tried only if primary failed)
            if not search_input:
                fallback_selectors = [
                    "input[placeholder*='Search']",
                    "input[placeholder*='search']",
                    ".search-box input",
                    "input[id*='search']",
                ]
                for selector in fallback_selectors:
                    try:
                        page.wait_for_selector(selector, timeout=3000)
                        loc = page.locator(selector).first
                        if loc.count() > 0 and loc.is_visible(timeout=2000):
                            search_input = loc
                            log_action(f"✅ Found search input (fallback): {selector}")
                            break
                    except:
                        continue

            if (not search_input or search_input.count() == 0) and homepage_ready:
                log_action("⚠️ Search input not found on homepage, switching to direct ROBU search results")
                if not self._goto_with_retry(page, direct_search_url, "Robu direct search results"):
                    return {
                        "sku": sku,
                        "found": False,
                        "reason": "ROBU search input was unavailable and direct search results failed to load",
                    }
                candidates = self._collect_product_candidates(page)
                if candidates:
                    return self._verify_candidate_product(page, sku, candidates)
                log_action(f"❌ No product links found on direct search results for SKU {sku}")
                return {"sku": sku, "found": False, "reason": f"No ROBU search results found for SKU {sku}"}

            if not search_input or search_input.count() == 0:
                log_action("❌ Search input not found with any selector")
                log_action(f"📍 Current URL: {page.url}")
                return {"sku": sku, "found": False, "reason": "ROBU search input was not available"}

            # STEP 1: Type SKU in search bar (AJAX dropdown will appear)
            log_action(f"📝 Typing SKU: {sku}")
            search_input.click()
            page.keyboard.press("Control+A")
            page.keyboard.press("Backspace")
            search_input.type(str(sku), delay=30)  # 30ms/char is fast enough to fire AJAX
            log_action(f"✅ Typed: {sku} - waiting for dropdown...")
            time.sleep(2)  # Wait for AJAX dropdown

            # STEP 2: Wait for dropdown container to appear
            try:
                log_action("⏳ Waiting for dropdown container...")
                time.sleep(2)  # Give JS time to render dropdown

                # STEP 3: Find product links within dropdown
                # Target custom Robu dropdown (plain HTML list with product links)
                product_links = page.locator("a[href*='/product/']")

                log_action(f"🔍 Found {product_links.count()} total links with /product/")
                
                target_product = None
                first_visible = None
                items_found = 0
                
                for i in range(product_links.count()):
                    try:
                        link = product_links.nth(i)
                        
                        # Check if link is visible and has enough text
                        if link.is_visible(timeout=500):
                            text = link.inner_text().strip()
                            if text and len(text) > 10:
                                items_found += 1
                                if not first_visible:
                                    first_visible = link
                                    
                                if str(sku).lower() in text.lower():
                                    target_product = link
                                    log_action(f"✅ Found exact SKU match in dropdown: {text[:50]}")
                                    break
                    except:
                        continue
                
                if not target_product and first_visible:
                    target_product = first_visible
                    log_action(f"✅ Selected first visible dropdown item: {target_product.inner_text().strip()[:50]}")
                    
                if not target_product:
                    log_action("❌ No dropdown items found - attempting verified fallback search")
                    try:
                        page.keyboard.press("Enter")
                    except Exception:
                        pass
                    try:
                        page.wait_for_load_state("domcontentloaded", timeout=8000)
                    except Exception:
                        pass

                    candidate_links = self._collect_product_candidates(page)
                    if candidate_links:
                        return self._verify_candidate_product(page, sku, candidate_links)

                    log_action("⚠️ Dropdown fallback did not yield a verified product page")
                    return {"sku": sku, "found": False, "reason": f"ROBU dropdown/search results did not yield a verified match for SKU {sku}"}
                
                product_text = target_product.inner_text().strip()
                log_action(f"🔗 Clicking dropdown product: {product_text[:50]}")
                
                # 🔥 CRITICAL: scroll + direct anchor click via JS to avoid clicking child elements
                target_product.scroll_into_view_if_needed()
                
                try:
                    outer_html = target_product.evaluate('el => el.outerHTML')
                    log_action(f"CLICKING: {outer_html[:200]}")
                except:
                    pass
                    
                target_product.evaluate("el => el.click()")
                
                # Wait for navigation to product page
                try:
                    page.wait_for_url("**/product/**", timeout=8000)
                except:
                    pass
                    
                page.wait_for_load_state("domcontentloaded", timeout=60000)
                log_action(f"✅ Navigated to: {page.url[:80]}")
                
                # Validate we're on product page (NOT search results)
                if "/product/" in page.url and "?s=" not in page.url:
                    return {"sku": sku, "product_url": page.url, "found": True}
                else:
                    log_action(f"❌ Not on product page. Current URL: {page.url}")
                    return {"sku": sku, "found": False, "reason": f"ROBU navigation ended on non-product URL: {page.url}"}
                    
            except Exception as e:
                log_action(f"❌ Dropdown click failed: {e}")
                return {"sku": sku, "found": False, "reason": f"ROBU dropdown click failed: {e}"}

        except Exception as e:
            log_action(f"Search error: {e}")
            return {"sku": sku, "found": False, "reason": f"ROBU search error: {e}"}

    def extract_price(self, page: Page, product_url: str, quantity: int, sku: str = "") -> Dict:
        """
        Extract price for a specific quantity, accounting for tiered pricing.
        Returns an insufficient-stock dict when available qty < requested qty.
        """
        try:
            if page.url != product_url:
                page.goto(product_url, wait_until="domcontentloaded", timeout=self.timeout)
            
            page.evaluate("window.scrollTo(0, 400)")
            
            # ── WAIT FOR PRICING TABLE TO RENDER ────────────────────────────────
            # The MOQ/tier table is rendered via AJAX. We must wait for it before
            # extracting, otherwise we race the DOM and get 0 rows.
            log_action("⏳ Waiting for pricing table to render...")
            try:
                page.wait_for_selector(
                    "table.pro_bulk_pricing_table, .bulk-pricing table, "
                    "table:has(tr:has-text('Quantity')), table:has(tr:has-text('MOQ'))",
                    timeout=6000
                )
                log_action("✅ Pricing table detected")
            except:
                log_action("⚠️ No pricing table found within 6s — will try base price")
            
            time.sleep(1)  # let any dynamic stock messages render

            # ── STOCK CHECK (before touching quantity) ──────────────────────
            # Robu shows: "Only 32 units available." as a WooCommerce notice
            # It appears in .woocommerce-error or plain page text after qty change.
            def _detect_stock_limit(page_ref, qty_requested, sku_val):
                """Scan the page for a stock-limit notice and return a result dict or None."""
                # 1. WooCommerce structured selectors
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
                                        "sku": sku_val, "found": True,
                                        "error": "Insufficient Stock",
                                        "message": msg,
                                        "available": available,
                                        "out_of_stock": True,
                                    }
                            if "out of stock" in msg.lower():
                                log_action(f"❌ Out-of-stock notice: {msg}")
                                return {"sku": sku_val, "found": False, "error": "Out of Stock", "out_of_stock": True}
                    except Exception:
                        continue

                # 2. JS full-page text fallback (catches notices inside shadow DOM / AJAX renders)
                try:
                    body_text = page_ref.evaluate("() => document.body.innerText")
                    m2 = re.search(r"only\s*(\d+)\s*(?:units?|items?)?\s*(?:are\s*)?available", body_text, re.IGNORECASE)
                    if m2:
                        available = int(m2.group(1))
                        msg = m2.group(0)
                        log_action(f"⚠️ Stock limit in page text: '{msg}' — available: {available}, need: {qty_requested}")
                        if available < qty_requested:
                            return {
                                "sku": sku_val, "found": True,
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

            # ── SET QUANTITY (triggers site-side stock validation) ───────────
            try:
                page.evaluate(f"""
                    (qty) => {{
                        let input = document.querySelector("input[name='quantity'], input.qty");
                        if (input) {{
                            input.value = qty;
                            input.dispatchEvent(new Event('input', {{ bubbles: true }}));
                            input.dispatchEvent(new Event('change', {{ bubbles: true }}));
                        }}
                    }}
                """, quantity)
                time.sleep(1.5)  # wait for AJAX stock validation
            except Exception:
                pass

            # Check again after setting quantity (Robu validates on qty change)
            stock_result = _detect_stock_limit(page, quantity, sku)
            if stock_result:
                return stock_result

            # ROBU SPECIFIC: Extract tiers from table
            # ── HELPER: fetch the one true product price (below SKU, blue, before Incl. GST)
            def _fetch_robu_base_price():
                """
                Returns the single-unit product price shown as:
                    ₹1.00  (Incl. GST)
                on Robu product pages — the blue price right below the SKU.
                We ONLY accept a match that is immediately followed by '(Incl. GST)'
                to avoid picking up tier-table prices or related-product prices.
                """
                # Method 1: look for the WooCommerce price element that contains
                # the '(Incl. GST)' suffix text on the same line/block.
                summary_selectors = [
                    ".entry-summary .price",
                    ".summary .price",
                    ".product-summary .price",
                    ".summary p.price",
                ]
                for sel in summary_selectors:
                    try:
                        el = page.locator(sel).first
                        if el.count() > 0 and el.is_visible(timeout=2000):
                            txt = el.inner_text().strip()
                            # Must contain 'Incl. GST' to be the real product price
                            if "incl" in txt.lower() and "gst" in txt.lower():
                                m = re.search(r"(?:₹|Rs\.?)\s*([\d,]+\.?\d*)", txt)
                                if m:
                                    val = float(m.group(1).replace(",", ""))
                                    if val > 0:
                                        log_action(f"[base price] CSS match '{sel}' → ₹{val}")
                                        return val
                    except:
                        continue

                # Method 2: JS body-text — search for the pattern ₹X.XX followed by
                # (Incl. GST) anywhere in the page text.
                try:
                    body_text = page.evaluate("() => document.body.innerText")
                    m = re.search(
                        r"(?:₹|Rs\.?)\s*([\d,]+\.?\d*)\s*\(\s*Incl\.?\s*GST\s*\)",
                        body_text, re.IGNORECASE
                    )
                    if m:
                        val = float(m.group(1).replace(",", ""))
                        if val > 0:
                            log_action(f"[base price] body-text match → ₹{val}")
                            return val
                except:
                    pass

                return None

            tier_prices = []

            try:
                # ── STRICT TABLE DETECTION ───────────────────────────────────────
                # Only use a table if it actually has "Quantity"/"MOQ" AND "Price"
                # headers — this prevents grabbing spec tables, related-product
                # tables, or any other noise on the page.
                target_rows = []
                all_tables = page.locator("table").all()
                log_action(f"Scanning {len(all_tables)} tables for pricing table...")

                for table in all_tables:
                    try:
                        table_text = table.inner_text().lower()
                        # Must contain both a quantity column AND a price column header
                        has_qty   = any(kw in table_text for kw in ["quantity", "qty", "moq"])
                        has_price = any(kw in table_text for kw in ["price", "₹", "rs."])
                        if has_qty and has_price:
                            target_rows = table.locator("tr").all()
                            log_action(f"✅ Found correct pricing table ({len(target_rows)} rows)")
                            break
                    except:
                        continue

                if not target_rows:
                    # Last-resort: Fibosearch/WooCommerce description list items with ₹
                    target_rows = page.locator(
                        ".woocommerce-product-details__short-description li:has-text('₹')"
                    ).all()
                    if target_rows:
                        log_action(f"Using description-list fallback ({len(target_rows)} items)")

                log_action(f"Extracting pricing tiers from {len(target_rows)} rows")

                for row in target_rows:
                    row_text = row.inner_text().strip().replace(",", "")

                    # Skip header rows (no digits that look like a range)
                    if not re.search(r"\d", row_text):
                        continue

                    # Must have a range marker (-  or  +) to be a real tier row
                    range_match = (
                        re.search(r"(\d+)\s*-\s*(\d+)", row_text) or
                        re.search(r"(\d+)\s*\+",         row_text) or
                        re.search(r"(\d+)\s*to\s*(\d+)", row_text, re.IGNORECASE)
                    )
                    if not range_match:
                        continue  # not a tier row — skip safely

                    # Extract price with currency symbol (strict — must have ₹ or Rs.)
                    price_match = re.search(r"(?:₹|Rs\.?)\s*([\d,]+\.?\d*)", row_text)
                    if not price_match:
                        continue  # no recognisable price — skip

                    try:
                        price   = float(price_match.group(1).replace(",", ""))
                        min_qty = int(range_match.group(1))
                        tier_prices.append({"min_qty": min_qty, "price": price})
                        log_action(f"Tier found: Qty {min_qty}+ -> ₹{price}")
                    except (ValueError, IndexError):
                        continue

                # ── INJECT BASE PRICE AS FLOOR TIER ─────────────────────────────
                # If no tier covers qty=1, fetch the true single-unit price
                # (₹X.XX Incl. GST — the blue price below the SKU) and inject it
                # as the catch-all floor so low-qty requests still get a price.
                has_base_tier = any(t["min_qty"] <= 1 for t in tier_prices)
                if not has_base_tier:
                    base_price = _fetch_robu_base_price()
                    if base_price is not None:
                        tier_prices.append({"min_qty": 1, "price": base_price})
                        log_action(f"✅ Injected base price tier: Qty 1+ -> ₹{base_price}")
                    else:
                        log_action("⚠️ Could not find base price (Incl. GST) to inject as floor tier")

                # Sort tiers by min_qty descending to find the highest applicable tier
                tier_prices.sort(key=lambda x: x["min_qty"], reverse=True)
                for tier in tier_prices:
                    if quantity >= tier["min_qty"]:
                        log_action(f"✅ Qty {quantity} matched tier {tier['min_qty']}+ -> ₹{tier['price']}")
                        return {"price": tier["price"], "tier_prices": tier_prices, "currency": "INR"}

            except Exception as e:
                log_action(f"Tier extraction failed: {e}")

            # ── NORMAL PRICE FALLBACK ─────────────────────────────────────────────
            # Only reached if tier extraction itself threw an exception.
            # Use the same strict helper to avoid returning random prices.
            log_action("⚠️ Tier logic exhausted — fetching strict base price (Incl. GST)")
            fallback_price = _fetch_robu_base_price()
            if fallback_price is not None:
                log_action(f"✅ Found base price via fallback: ₹{fallback_price}")
                return {"price": fallback_price, "tier_prices": [], "currency": "INR"}


            return {"price": "Not Available", "tier_prices": []}
        except Exception as e:
            log_action(f"Extraction error: {e}")
            return {"price": "Not Available", "tier_prices": []}

    def add_to_cart(self, page: Page, product_url: str, quantity: int) -> bool:
        """
        Add to cart logic that matches the successful pattern used of other sites.
        """
        try:
            log_action(f"Adding {quantity} units to cart for: {product_url}")
            if page.url != product_url:
                page.goto(product_url, wait_until="networkidle", timeout=self.timeout)
            
            time.sleep(2)
            page.evaluate("window.scrollTo(0, 500)")

            # 1. Handle Quantity
            qty_input = page.locator("input.qty, input[name='quantity'], .quantity input").first
            if qty_input.count() > 0 and qty_input.is_visible():
                qty_input.click()
                page.keyboard.press("Control+A")
                page.keyboard.press("Backspace")
                time.sleep(0.5)
                qty_input.type(str(int(quantity)), delay=100)
                log_action(f"Filled quantity: {quantity}")

            # 2. Click Add to Cart
            add_button = page.locator("button.single_add_to_cart_button, .add_to_cart_button, button:has-text('Add to Cart')").first
            if add_button.count() > 0:
                add_button.click(force=True)
                log_action("Clicked Add to Cart button")
                time.sleep(4)
                
                # 3. Always go to cart page to finalize and recalculate
                page.goto("https://robu.in/cart/", wait_until="networkidle")
                time.sleep(3)
                
                # Check if item appeared
                if page.locator(".cart_item, .cart-item, td.product-name").count() > 0:
                    log_action("✅ Item successfully added and verified in cart")
                    return True
                
            log_action("❌ Could not verify item in cart")
            return False
        except Exception as e:
            log_action(f"Add to cart error: {e}")
            return False
