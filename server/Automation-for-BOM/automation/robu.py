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

def log_action(message: str):
    """Log action with timestamp"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🔍 ROBU: {message}")

class RobuScraper:
    def __init__(self):
        self.base_url = "https://robu.in"
        self.timeout = 60000

    def search_product(self, page: Page, sku: str) -> Dict:
        try:
            log_action(f"Starting search for SKU: {sku}")
            if "robu.in" not in page.url:
                page.goto(self.base_url, wait_until="domcontentloaded", timeout=self.timeout)
                time.sleep(3)
            
            search_input = page.locator(".dgwt-wcas-search-input, input[type='text'][placeholder*='search']").first
            if not search_input.is_visible(timeout=5000):
                log_action("❌ Search input not found")
                return {"sku": sku, "found": False}

            # 1. Type SKU
            search_input.click()
            page.keyboard.press("Control+A")
            page.keyboard.press("Backspace")
            search_input.fill(str(sku))
            
            # 2. Wait for AJAX Suggestions
            try:
                # Target the specific dropdown container
                page.wait_for_selector(".dgwt-wcas-suggestions-wrapp, .autocomplete-suggestions", timeout=2000)
                # Click the first product suggestion (high accuracy)
                suggestion = page.locator(".dgwt-wcas-suggestion-product, .dgwt-wcas-suggestion").first
                if suggestion.is_visible():
                    log_action("✅ AJAX suggestion found, clicking...")
                    suggestion.click(force=True)
                    page.wait_for_load_state("domcontentloaded", timeout=60000)
                else:
                    raise Exception("No suggestions visible")
            except:
                log_action("Dropdown not found, submitting search via Enter...")
                page.keyboard.press("Enter")
                page.wait_for_load_state("domcontentloaded", timeout=60000)

            # 3. Handle Results Page (If not already on product page)
            if "/product/" in page.url:
                log_action(f"✅ Fast-track to product: {page.url[:60]}")
            else:
                log_action("On results page, filtering for correct part...")
                # Select only actual product links in the grid (skip banners)
                links = page.locator(".products .product-title a, .product-small .name a").all()
                found = False
                for link in links:
                    href = link.get_attribute("href") or ""
                    text = link.inner_text().lower()
                    # STRICT MATCH: SKU in URL or Part Number in Title
                    if str(sku).lower() in href.lower() or str(sku).lower() in text:
                        log_action(f"🎯 Match found: {text}")
                        link.scroll_into_view_if_needed()
                        link.click(timeout=5000)
                        page.wait_for_load_state("domcontentloaded")
                        found = True
                        break
                
                if not found:
                    log_action("❌ No strict SKU match found in results")
                    return {"sku": sku, "found": False}

            # 4. Final Validation: Post-navigation check
            page.wait_for_load_state("domcontentloaded")
            content = page.content().lower()
            if str(sku).lower() not in content and str(sku).lower().replace('-', '') not in content:
                log_action(f"⚠️ Validation failed: SKU {sku} not found on page. Going back.")
                page.go_back()
                return {"sku": sku, "found": False}

            return {"sku": sku, "product_url": page.url, "found": True}
        except Exception as e:
            log_action(f"Search error: {e}")
            return {"sku": sku, "found": False}
        except Exception as e:
            log_action(f"Search error: {e}")
            return {"sku": sku, "product_url": None, "found": False}

    def extract_price(self, page: Page, product_url: str, quantity: int, sku: str = "") -> Dict:
        """
        Extract price for a specific quantity, accounting for tiered pricing.
        Returns an insufficient-stock dict when available qty < requested qty.
        """
        try:
            if page.url != product_url:
                page.goto(product_url, wait_until="domcontentloaded", timeout=self.timeout)
            
            page.evaluate("window.scrollTo(0, 400)")
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
            tier_prices = []

            try:
                # Robu often has a table with "Quantity" and "Price" columns
                rows = page.locator("table.pro_bulk_pricing_table tr, .bulk-pricing table tr").all()
                if not rows:
                    # Fallback for alternative tier layouts
                    rows = page.locator(".woocommerce-product-details__short-description li:has-text('₹')").all()

                log_action(f"Extracting pricing tiers from {len(rows)} rows")
                
                for row in rows:
                    row_text = row.inner_text().replace(",", "")
                    # Match patterns like "10-49 ₹0.29", "50+ ₹0.24", "10 to 49 ₹0.29"
                    # Handle ₹, Rs., integers, decimals, and commas
                    price_match = re.search(r"[\u20b9Rs\.\$]?\s*([\d,]+\.?\d*)", row_text)
                    range_match = re.search(r"(\d+)\s*[-+]", row_text) or re.search(r"(\d+)\s*to\s*(\d+)", row_text)
                    
                    if price_match:
                        price_str = price_match.group(1).replace(",", "")
                        try:
                            price = float(price_str)
                            # Default range to infinity if not found
                            min_qty = int(range_match.group(1)) if range_match else 1
                            tier_prices.append({"min_qty": min_qty, "price": price})
                            log_action(f"Tier found: Qty {min_qty}+ -> ₹{price}")
                        except ValueError:
                            continue

                # Sort tiers by min_qty descending to find the highest match
                tier_prices.sort(key=lambda x: x["min_qty"], reverse=True)
                for tier in tier_prices:
                    if quantity >= tier["min_qty"]:
                        log_action(f"✅ Qty {quantity} matched tier {tier['min_qty']}+ -> ₹{tier['price']}")
                        return {"price": tier["price"], "tier_prices": tier_prices, "currency": "INR"}
            except Exception as e:
                log_action(f"Tier extraction failed: {e}")

            price_selectors = [
                ".summary .price .woocommerce-Price-amount",
                ".summary .price ins .woocommerce-Price-amount", 
                ".summary .price",
                ".price .woocommerce-Price-amount",
                ".product-summary .price",
                ".summary p.price"
            ]
            for selector in price_selectors:
                try:
                    el = page.locator(selector).first
                    if el.count() > 0 and el.is_visible():
                        text = el.inner_text().strip()
                        # Better regex to handle ₹ 0.78 (Incl. GST)
                        match = re.search(r"(?:₹|Rs\.?)\s*([\d,]+\.?\d*)", text)
                        if not match:
                            match = re.search(r"([\d,]+\.?\d*)", text)
                        
                        if match:
                            val = float(match.group(1).replace(",", ""))
                            log_action(f"✅ Found base price: ₹{val}")
                            return {"price": val, "tier_prices": [], "currency": "INR"}
                except: continue

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
