"""
Cart Automation Module
Handles adding products to cart and generating cart links (SYNC VERSION)
"""
from typing import Dict, Optional, Any
import os
import time
import math
import re
import random
from pathlib import Path
from dotenv import load_dotenv
from playwright.sync_api import Page

load_dotenv()

SESSION_DIR = Path(__file__).parent.parent / "session"

class VendorResult:
    """Standardized result from vendor cart operations"""
    def __init__(self, status: str, added_qty: int = 0, unit_price: float = 0.0, total_price: float = 0.0, reason: str = ""):
        self.status = status # SUCCESS | PARTIAL | INVALID
        self.added_qty = added_qty
        self.unit_price = unit_price
        self.total_price = total_price
        self.reason = reason

class CartAutomation:
    """Cart automation for selected website"""
    def login_to_robu(self, page: Page) -> bool:
        """
        Login to Robu at the start of the session
        """
        try:
            email = os.getenv("ROBU_EMAIL")
            password = os.getenv("ROBU_PASSWORD")
            if not email or not password:
                print("[!] Robu credentials not found in .env")
                return False

            print(f"[*] Navigating to Robu login page...")
            # Use domcontentloaded + manual delay instead of networkidle
            page.goto("https://robu.in/my-account/", wait_until="domcontentloaded", timeout=30000)
            time.sleep(5) # Give scripts time to init

            # Check if already logged in
            is_logged_in = page.locator(
                "a:has-text('Logout'), .woocommerce-MyAccount-navigation-link--customer-logout"
            ).count() > 0

            if not is_logged_in:
                user_field = page.locator("input[name='email'], input[id*='username']").first
                if user_field.count() > 0:
                    print(f"[*] Logging in as {email}...")
                    
                    # Human-like typing
                    user_field.fill(email)
                    
                    pass_field = page.locator("input[name='password']").first
                    pass_field.fill(password)
                    
                    page.click("button:has-text('Login'), button[name='login']")
                    
                    # Wait for dashboard using domcontentloaded
                    page.wait_for_load_state("domcontentloaded", timeout=15000)
                    
                    is_success = page.locator("a:has-text('Logout'), .woocommerce-MyAccount-navigation, .woocommerce-MyAccount-content").count() > 0
                    if is_success:
                        print("[✓] Login successful")
                    else:
                        print("[!] Login state ambiguous, proceeding anyway.")
                    time.sleep(3)
                else:
                    print("[!] Could not find login fields or logout link.")
            else:
                print("[*] Already logged in to Robu")
            
            return True
        except Exception as e:
            print(f"[!] Login failed: {e}")
            return False

    def clear_robu_cart(self, page: Page) -> bool:
        """
        Clear the Robu cart to start fresh.
        """
        try:
            print("[*] Navigating to Robu cart to clear existing items...")
            page.goto("https://robu.in/cart/", wait_until="domcontentloaded", timeout=30000)
            time.sleep(2)

            # Look for "Remove" buttons or "Clear Cart" button
            # Robu usually has "×" (remove) buttons for each item
            remove_buttons = page.locator(".remove, .cart-item .remove, .woocommerce-cart-form__cart-item .remove").all()
            if remove_buttons:
                print(f"[*] Found {len(remove_buttons)} items in cart. Removing all...")
                for _ in range(len(remove_buttons)):
                    # Re-locate as the DOM changes after each removal
                    btn = page.locator(".remove, .cart-item .remove, .woocommerce-cart-form__cart-item .remove").first
                    if btn.count() > 0:
                        btn.click(force=True)
                        time.sleep(2) # Wait for AJAX removal
                print("[✓] Robu cart cleared")
            else:
                print("[*] Robu cart is already empty")
            return True
        except Exception as e:
            print(f"[!] Error clearing Robu cart: {e}")
            return False

    def remove_item_from_cart(self, page: Page, item_name: str, vendor: str, quantity: int = 0, unit_price: float = 0.0) -> bool:
        """Removes a specific item from the cart if it's deemed INVALID"""
        try:
            print(f"[{vendor}] 🗑️ Removing invalid item from cart: {item_name} (Qty: {quantity}, Price: ₹{unit_price})")
            cart_urls = {
                "ROBU": "https://robu.in/cart/",
                "KTRON": "https://www.ktron.in/cart/",
                "SHARVI": "https://sharvielectronics.com/cart/",
                "EVELTA": "https://evelta.com/cart.php"
            }
            url = cart_urls.get(vendor.upper())
            if not url: return False

            if page.url != url:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
            
            time.sleep(2)
            
            # Special logic for ROBU as requested by user
            if vendor.upper() == "ROBU":
                # 1. Light scroll
                page.mouse.wheel(0, 300)
                time.sleep(1)

                # 2. Find correct row by name, quantity, and price
                rows = page.locator("tr.cart_item, .cart-item, tr:has(.product-name)")
                target_row = None
                
                for i in range(rows.count()):
                    row = rows.nth(i)
                    row_text = row.inner_text()
                    
                    # Check name
                    if item_name.lower() not in row_text.lower():
                        continue
                    
                    # Check quantity (optional but highly recommended as per user request)
                    if quantity > 0:
                        qty_input = row.locator("input.qty, input[type='number']").first
                        if qty_input.count() > 0:
                            actual_qty = qty_input.input_value()
                            if str(quantity) not in actual_qty:
                                continue
                    
                    target_row = row
                    break
                
                if target_row:
                    # 3. Tick the box
                    checkbox = target_row.locator("input[type='checkbox']").first
                    if checkbox.count() > 0:
                        checkbox.scroll_into_view_if_needed()
                        checkbox.click(force=True)
                        print(f"[{vendor}] ✅ Selected item via checkbox")
                        time.sleep(1)

                        # 4. Handle confirmation dialog (OK button)
                        page.on("dialog", lambda dialog: (print(f"[{vendor}] 💬 Accepting dialog: {dialog.message}"), dialog.accept()))

                        # 5. Click Delete Item button
                        delete_btn = page.locator("button:has-text('Delete Items'), .button-delete").first
                        if delete_btn.count() > 0:
                            delete_btn.click()
                            print(f"[{vendor}] ✅ Clicked 'Delete Items'")
                            time.sleep(3)
                            return True
                
                print(f"[{vendor}] ⚠️ Could not find specific row for {item_name} with Qty {quantity}")
                # Fallback to direct trash can if checkbox flow failed? No, user was specific.
                # But let's try a fallback row search if the above loop failed
            
            # Generic fallback (original logic)
            row = None
            selectors = [
                f".cart-item:has-text('{item_name}')",
                f"tr:has-text('{item_name}')",
                f".cart_item:has-text('{item_name}')"
            ]
            for sel in selectors:
                loc = page.locator(sel).first
                if loc.count() > 0:
                    row = loc
                    break
            
            if row:
                # Find remove button in that row
                remove_btn = row.locator(".remove, .cart-remove, .delete, a[aria-label*='Remove']").first
                if remove_btn.count() > 0:
                    remove_btn.click()
                    print(f"[{vendor}] ✅ Item removed from cart via row remove button")
                    time.sleep(3) # Wait for AJAX
                    return True
            
            print(f"[{vendor}] ⚠️ Could not find remove button for {item_name}")
            return False
        except Exception as e:
            print(f"[{vendor}] ❌ Error removing item: {e}")
            return False

    def _verify_and_correct_cart_qty(self, page: Page, cart_url: str, item_name: str, quantity: int, product_url: str, expected_qty: int = 0, unit_price: float = 0.0) -> Dict:
        """Navigates to the cart, finds the item, checks if quantity matches, and attempts to correct if not."""
        # Use quantity as baseline for expected_qty if not provided
        target_qty = expected_qty if expected_qty > 0 else quantity
        
        print(f"[*] Navigating to cart page ({cart_url}) to verify and fix quantity (Expected: {target_qty}, Price: ₹{unit_price})...")
        page.goto(cart_url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(2)  # Let cart page JS render

        # ── CHECK & CORRECT QUANTITY IN CART ──
        try:
            def _get_row_locator():
                import urllib.parse
                url_path = urllib.parse.urlparse(product_url).path.rstrip('/')
                last_segment = url_path.split('/')[-1] if url_path else ""
                
                # 1. Try to find all potential rows
                rows = page.locator("tr.cart_item, tr.woocommerce-cart-form__cart-item, .cart-item, tr:has(.product-name), tbody.cart-list tr").all()
                
                if not rows:
                    print("[!] No cart rows found with standard selectors.")
                    return None

                # 2. Iterate and match by Name, Slug, or Price
                for row in rows:
                    try:
                        row_text = row.inner_text()
                        row_html = row.inner_html()
                        
                        # A. Match by Name or SKU in text
                        name_match = False
                        if item_name and item_name.lower() in row_text.lower():
                            name_match = True
                        
                        # B. Match by Slug in links (Very robust for Ktron/Evelta)
                        slug_match = False
                        if last_segment:
                            # Check if any link in the row contains the last segment of the URL
                            import re
                            # Escape for regex
                            escaped_slug = re.escape(last_segment)
                            if re.search(f'href=["\'][^"\']*{escaped_slug}[^"\']*["\']', row_html, re.IGNORECASE):
                                slug_match = True
                        
                        # C. Match by Price (highly robust)
                        price_match = False
                        if unit_price > 0:
                            # Extract all numbers that look like prices
                            import re
                            row_prices = re.findall(r"(?:\u20B9|Rs\.?|₹)\s*([\d,]+\.?\d*)", row_text)
                            
                            is_sharvi = "sharvielectronics.com" in cart_url or "SHARVI" in cart_url.upper()
                            # Tighten tolerance for non-Sharvi vendors (especially Evelta/Ktron)
                            tolerance = 0.15 if is_sharvi else 0.02
                            
                            for p_str in row_prices:
                                try:
                                    p_val = float(p_str.replace(",", ""))
                                    if abs(p_val - unit_price) <= tolerance:
                                        price_match = True
                                        break
                                except: continue
                        else:
                            price_match = True
                        
                        # Final Decision: Prefer Slug Match + Price Match, or Name Match + Price Match
                        if (slug_match or name_match) and price_match:
                            print(f"[*] Found matching row for '{item_name}' (Slug Match: {slug_match}, Name Match: {name_match}, Price Match: {price_match})")
                            return row
                    except: continue

                # 3. Last resort fallbacks (DISABLED for Evelta as per USER request for strictness)
                is_evelta = "evelta.com" in cart_url.lower()
                if is_evelta:
                    print(f"[EVELTA] ⚠️ Precise Name+Price row match failed. Skipping fallbacks to avoid wrong item modification.")
                    return None

                if last_segment:
                    loc = page.locator(f"tr:has(a[href*='{last_segment}']), .cart-item:has(a[href*='{last_segment}']), li:has(a[href*='{last_segment}'])").first
                    if loc.count() > 0: return loc
                
                if item_name:
                    loc = page.locator(f"tr.cart_item:has-text('{item_name}'), tr:has-text('{item_name}'), li:has-text('{item_name}'), .cart-item:has-text('{item_name}')")
                    if loc.count() > 0: return loc.first
                
                print(f"[!] Warning: Could not find precise row for {item_name} with price ₹{unit_price}")
                return None

            # Find the cart row for THIS item
            row_locator = _get_row_locator()
            
            if not row_locator:
                print(f"[!] ❌ Could not locate row for {item_name} in cart. Verification failed.")
                return {"success": False, "message": "Could not locate item row in cart", "cart_url": cart_url}

            # ── ROBUST QUANTITY INPUT SELECTION ──
            # Try multiple selectors to find the quantity input
            selectors = ["input[name='qty[]']", "input.qty", "input[name*='qty']", "input[type='number']", "input.form-input--incrementTotal"]
            cart_qty_input = None
            
            # 1. Try within the specific row first
            for sel in selectors:
                try:
                    loc = row_locator.locator(sel).first
                    if loc.count() > 0:
                        cart_qty_input = loc
                        break
                except: continue
            
            # 2. Fallback to global search (ONLY if row search failed, but we prefer row-scoped)
            if not cart_qty_input or cart_qty_input.count() == 0:
                print(f"[!] Warning: Row-scoped quantity input not found for {item_name}. Attempting global fallback (risk of wrong item).")
                for sel in selectors:
                    try:
                        loc = page.locator(sel).last
                        if loc.count() > 0:
                            cart_qty_input = loc
                            break
                    except: continue
            
            # 3. Last resort retry (Reload page)
            if not cart_qty_input or cart_qty_input.count() == 0:
                print(f"[*] ❌ Cannot find quantity input for {item_name} -> retrying once with reload")
                page.reload()
                time.sleep(3)
                row_locator = _get_row_locator()
                if row_locator:
                    for sel in selectors:
                        try:
                            loc = row_locator.locator(sel).first
                            if loc.count() > 0:
                                cart_qty_input = loc
                                break
                        except: continue

            if cart_qty_input and cart_qty_input.is_visible(timeout=5000):
                cart_qty_input.scroll_into_view_if_needed()
                current_qty = cart_qty_input.input_value()
                current_qty_int = 0
                try:
                    current_qty_int = int(current_qty)
                except: pass

                # ── SHARVI MOQ EXCEPTION ──
                # If vendor is SHARVI, we treat "more than requested" as an error ONLY if it doesn't match the expected_qty
                is_sharvi = "sharvielectronics.com" in cart_url or "SHARVI" in cart_url.upper()
                
                if current_qty_int < target_qty:
                    print(f"[!] Stock limit detected in cart: only {current_qty_int} available (Target: {target_qty})")
                    return {
                        "success": True,
                        "insufficient_stock": True,
                        "available": current_qty_int,
                        "added_qty": current_qty_int,
                        "message": f"Only {current_qty_int} units allowed by vendor stock.",
                        "cart_url": cart_url,
                    }
                
                if current_qty_int > target_qty:
                    # For Sharvi, if quantity > target_qty, we assume it's due to an unhandled MOQ or old item
                    if is_moq_vendor and expected_qty > 0 and current_qty_int == expected_qty:
                         print(f"[{'SHARVI' if 'sharvi' in cart_url else 'KTRON'}] ✅ Quantity in cart ({current_qty_int}) matches expected MOQ. Accepting.")
                         return {
                            "success": True,
                            "added_qty": current_qty_int,
                            "cart_url": cart_url,
                            "message": f"Accepted MOQ: {current_qty_int}"
                        }

                    # --- EVELTA STRICTURE CHECK ---
                    is_evelta = "evelta.com" in cart_url.lower()
                    if is_evelta:
                        # Double-check that row_locator STILL matches price before correcting
                        row_text = row_locator.inner_text()
                        price_ok = False
                        if unit_price > 0:
                            row_prices = re.findall(r"(?:\u20B9|Rs\.?|₹)\s*([\d,]+\.?\d*)", row_text)
                            for p_str in row_prices:
                                try:
                                    if abs(float(p_str.replace(",", "")) - unit_price) <= 0.02:
                                        price_ok = True; break
                                except: continue
                        else: price_ok = True
                        
                        if not price_ok:
                            print(f"[EVELTA] ❌ Row verify failed during correction attempt. Row text does not contain ₹{unit_price}. Aborting modification to prevent damage.")
                            return {"success": False, "message": "Row verification failed before correction", "cart_url": cart_url}

                    print(f"[!] Target discrepancy! Current: {current_qty_int} vs Target: {target_qty}. Attempting correction...")
                    # Try to reduce it downwards
                    def _overwrite_cart_qty():
                        # Use the row_locator directly if possible
                        row = row_locator
                        if row.count() > 0:
                            inp = row.locator("input.qty, input[name*='qty'], input[type='number'], input.form-input--incrementTotal").first
                        else:
                            inp = page.locator("input.qty, input[name*='qty'], input[type='number'], input.form-input--incrementTotal").last
                        
                        try:
                            inp.scroll_into_view_if_needed(timeout=5000)
                        except: pass
                        time.sleep(0.3)

                        print(f"[*] Overwriting quantity to {target_qty}...")
                        inp.evaluate(f"(el, val) => {{ el.value = val; el.dispatchEvent(new Event('input', {{ bubbles: true }})); el.dispatchEvent(new Event('change', {{ bubbles: true }})); }}", target_qty)
                        time.sleep(0.5)

                        try:
                            update_btn = page.locator("button[name='update_cart'], button:has-text('Update Cart'), a:has-text('Update')").first
                            if update_btn.count() > 0:
                                update_btn.scroll_into_view_if_needed(timeout=2000)
                                for _ in range(10):
                                    if not update_btn.is_disabled(): break
                                    time.sleep(0.5)
                                update_btn.click(force=True)
                        except Exception:
                            page.keyboard.press("Enter")
                        time.sleep(3) 

                        row2 = _get_row_locator()
                        val = "0"
                        if row2.count() > 0:
                            val = row2.locator("input.qty, input[name*='qty'], input[type='number'], input.form-input--incrementTotal").first.input_value()
                        else:
                            val = page.locator("input.qty, input[name*='qty'], input[type='number'], input.form-input--incrementTotal").first.input_value()
                        try:
                            return int(val)
                        except:
                            return 0

                    # Attempt correction
                    final_result_qty = _overwrite_cart_qty()
                    print(f"[*] Final quantity after adjustment attempt: {final_result_qty}")
                    
                    return {
                        "success": True,
                        "added_qty": final_result_qty,
                        "insufficient_stock": final_result_qty < target_qty,
                        "available": final_result_qty,
                        "cart_url": cart_url
                    }
                else:
                    print(f"[OK] Quantity matches target: {current_qty}")
                    # Return immediately with verified quantity
                    return {
                        "success": True, 
                        "added_qty": current_qty_int, 
                        "cart_url": cart_url,
                        "message": "Verified quantity matches requirement"
                    }
            else:
                print("[!] Could not find any quantity input on the cart page.")
        except Exception as e:
            print(f"[!] Error during cart quantity correction: {str(e)}")

        # ── FINAL VERIFICATION ──
        # Robust check: Wait for ANY item row to be visible before concluding failure
        verification_selectors = [
            "tr.cart_item",
            ".cart-item",
            "td.product-name",
            ".cart-list",
            ".woocommerce-cart-form__cart-item",
            "tr.woocommerce-cart-form__cart-item"
        ]
        
        found_in_cart = False
        for sel in verification_selectors:
            try:
                if page.locator(sel).count() > 0:
                    found_in_cart = True
                    break
            except: continue
            
        if found_in_cart:
            print(f"[✓] Successfully verified in cart")
            # Return target_qty (which is target_qty or final_moq_qty) as the added_qty
            return {"success": True, "added_qty": target_qty, "cart_url": cart_url, "message": "Added and verified in cart"}
        else:
            # One last try: wait 2 seconds and check again
            time.sleep(2)
            if page.locator(", ".join(verification_selectors)).count() > 0:
                print(f"[✓] Successfully verified in cart (after extra wait)")
                return {"success": True, "added_qty": target_qty, "cart_url": cart_url, "message": "Added and verified in cart"}
            
            print(f"[!] Item verification failed — no cart items found with standard selectors")
            return {"success": False, "added_qty": 0, "message": "Item not found in cart after verification", "cart_url": product_url}

    def add_to_cart_robu(self, page: Page, product_url: str, quantity: int, item_name: str = "", unit_price: float = 0.0) -> Dict:
        """
        Add product to Robu cart using an existing (already logged-in) page.
        item_name: used to find the correct cart row when multiple items exist.
        """
        try:
            # ── NAVIGATE DIRECTLY TO PRODUCT PAGE ──
            print(f"[*] Navigating to product page: {product_url}")
            page.goto(product_url, wait_until="domcontentloaded", timeout=30000)
            # Shorter wait — just enough for React to hydrate
            time.sleep(2)

            # Scroll down to reveal the quantity + Add to Cart section
            page.evaluate("window.scrollTo(0, 800)")
            time.sleep(0.5)
            page.mouse.move(500, 500)  # Trigger hover states

            # ── QUANTITY INPUT (CTRL+A + DIGIT-BY-DIGIT TO AVOID STACKING) ──
            qty_found = False
            qty_selectors = ["input[name='quantity']", "input.qty", "input[type='number']"]
            for sel in qty_selectors:
                try:
                    quantity_input = page.locator(sel).first
                    if quantity_input.is_visible(timeout=8000):
                        print(f"[*] Setting quantity to {quantity} via Ctrl+A + slow type...")

                        # Triple-click selects all existing text in the field
                        quantity_input.click(click_count=3)
                        
                        # Use fill instead of digit-by-digit for speed and accuracy
                        quantity_input.fill(str(quantity))
                        
                        # Force trigger events to ensure React updates
                        page.evaluate("""(data) => {
                            let el = document.querySelector(data.sel);
                            if (el) {
                                el.value = data.val;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }""", {"sel": sel, "val": str(quantity)})

                        time.sleep(1.0) # Wait for React to sync
                        actual = quantity_input.input_value()
                        print(f"[*] Quantity field shows: {actual} (wanted: {quantity})")
                        qty_found = True
                        break
                except Exception as e:
                    print(f"[-] Quantity selector {sel} failed: {e}")
                    continue

            # ── ADD TO CART BUTTON ──
            time.sleep(1)

            # Robu button cycles: "Add to Cart" → "Adding..." (disabled) → done
            # Use force=True to click even if it appears disabled/in-transition
            add_selectors = [
                "button.product-button",
                "button.single_add_to_cart_button",
                "button:has-text('Add to Cart')",
                "[name='add-to-cart']",
            ]
            btn_clicked = False
            for sel in add_selectors:
                try:
                    add_btn = page.locator(sel).first
                    add_btn.wait_for(state="visible", timeout=8000)
                    add_btn.scroll_into_view_if_needed()
                    time.sleep(0.3)
                    add_btn.click(force=True)
                    print(f"[*] Clicked Add to Cart (selector: {sel})")
                    btn_clicked = True
                    break
                except Exception as e:
                    print(f"[-] Add-to-cart selector {sel} failed: {e}")
                    continue

            if not btn_clicked:
                print("[!] Could not click Add to Cart button — will still check cart")

            # Wait for Robu's success toast / AJAX to finish
            # Also watch for stock-limit errors ("Only 32 units available.")
            insufficient_stock_info = None
            try:
                # Wait for either success OR error notice
                page.wait_for_selector(
                    "div:has-text('Product added to cart'), .woocommerce-message, .added_to_cart,"
                    " .woocommerce-error, .woocommerce-notices-wrapper .woocommerce-error",
                    timeout=8000
                )
                # Check for error first
                err_loc = page.locator(".woocommerce-error, .woocommerce-notices-wrapper .woocommerce-error").first
                if err_loc.count() > 0 and err_loc.is_visible(timeout=1000):
                    err_text = err_loc.inner_text().strip()
                    import re
                    m = re.search(r"only\s*(\d+)\s*(?:units?|items?)?\s*(?:are\s*)?available", err_text, re.IGNORECASE)
                    if m:
                        available = int(m.group(1))
                        print(f"[!] Robu stock limit detected in error toast: '{err_text}'")
                        print(f"[*] Parsed available quantity: {available}")
                        insufficient_stock_info = {"available": available, "message": err_text}
                    else:
                        print(f"[!] Robu error notice (no stock limit pattern found): {err_text}")
                else:
                    print("[✓] Success toast detected — product added to cart")
            except Exception:
                print("[*] No success/error toast detected — waiting 4s and proceeding anyway")
                # Still do a JS body text scan as fallback
                try:
                    import re
                    body_text = page.evaluate("() => document.body.innerText")
                    m2 = re.search(r"only\s*(\d+)\s*(?:units?|items?)?\s*(?:are\s*)?available", body_text, re.IGNORECASE)
                    if m2:
                        available = int(m2.group(1))
                        insufficient_stock_info = {"available": available, "message": m2.group(0)}
                        print(f"[!] Stock limit found in page text: only {available} available")
                except Exception:
                    pass
                time.sleep(4)

            # If stock is insufficient, try to proceed with what's available
            if insufficient_stock_info:
                available = insufficient_stock_info["available"]
                print(f"[*] 🔄 Retrying with available stock: {available}")
                if available > 0:
                    quantity = available # Set target to available for verification
                else:
                    return {
                        "success": False,
                        "insufficient_stock": True,
                        "available": 0,
                        "message": "Out of stock",
                        "cart_url": product_url,
                    }

            # ── ALWAYS GO TO CART PAGE TO VERIFY & FIX QUANTITY ──
            return self._verify_and_correct_cart_qty(page, "https://robu.in/cart/", item_name, quantity, product_url, unit_price=unit_price)
        except Exception as e:
            return {"success": False, "message": f"Error adding to cart: {str(e)}", "cart_url": product_url}

    # -------------------------------------------------------------------------
    # Popup dismissal helper (OneSignal, cookie banners, notification prompts)
    # -------------------------------------------------------------------------
    def _dismiss_popups(self, page: Page):
        """Dismiss any overlay popups that could block button clicks."""
        dismiss_selectors = [
            "button:has-text('Allow')",                    # Specific for Ktron notification popup
            "button:has-text('ALLOW')",
            "#onesignal-slidedown-allow-button",
            "#onesignal-popover-allow-button",
            "#onesignal-slidedown-cancel-button",         # OneSignal ‘Cancel’
            ".onesignal-slidedown-cancel-button",
            "button.onesignal-slidedown-cancel",
            "#onesignal-popover-cancel-button",
            "button:has-text('No Thanks')",
            "button:has-text('No, thanks')",
            "button:has-text('Not now')",
            "button:has-text('Cancel')",
            "[aria-label='Close notification']",
            ".cookie-notice-container #cn-refuse-cookie",
        ]
        for sel in dismiss_selectors:
            try:
                # Try both exact and partial matches for buttons
                btns = page.locator(sel).all()
                for btn in btns:
                    if btn.is_visible(timeout=1000):
                        print(f"    [popup] Attempting to dismiss: {sel}")
                        btn.click(force=True)
                        time.sleep(0.5)
            except Exception:
                pass
        
        # Global fallback: scan all frames (including iframes) for the 'Allow' button
        for frame in page.frames:
            try:
                # 1. Standard locator in frame
                allow_btn = frame.locator("button:has-text('Allow'), button:has-text('ALLOW')").first
                if allow_btn.is_visible(timeout=500):
                    allow_btn.click(force=True)
                    print(f"    [popup] Clicked Allow in frame: {frame.name or 'main'}")
                else:
                    # 2. JS injection in frame
                    clicked = frame.evaluate("""() => {
                        const btns = Array.from(document.querySelectorAll('button, a, span, div'));
                        const allow = btns.find(b => b.innerText && b.innerText.trim() === 'Allow');
                        if (allow) {
                            allow.click();
                            return true;
                        }
                        return false;
                    }""")
                    if clicked:
                        print(f"    [popup] JS-Clicked Allow in frame: {frame.name or 'main'}")
            except:
                pass

    def clear_generic_cart(self, page: Page, cart_url: str, vendor_name: str) -> bool:
        """Clear cart for generic WooCommerce sites (Ktron, Sharvi)"""
        try:
            print(f"[{vendor_name}] Navigating to cart to clear existing items...")
            page.goto(cart_url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(2)
            
            # 1. Try "Empty Cart" button if it exists
            empty_btn = page.locator("button:has-text('Empty Cart'), a:has-text('Empty Cart'), button:has-text('Clear Cart')").first
            if empty_btn.count() > 0 and empty_btn.is_visible(timeout=2000):
                print(f"[{vendor_name}] Found 'Empty Cart' button. Clicking...")
                # Handle confirmation dialog if any
                page.on("dialog", lambda dialog: dialog.accept())
                empty_btn.click(force=True)
                time.sleep(4)
                print(f"[{vendor_name}] Cart cleared via button")
                return True

            # 2. Manual removal via 'x' buttons
            remove_buttons_loc = page.locator(".remove, a[aria-label='Remove this item'], .cart_item .remove, .product-remove a")
            count = remove_buttons_loc.count()
            if count > 0:
                print(f"[{vendor_name}] Found {count} items. Removing manually...")
                for _ in range(count):
                    btn = remove_buttons_loc.first
                    if btn.count() > 0:
                        try:
                            btn.scroll_into_view_if_needed(timeout=2000)
                            btn.click(force=True, timeout=3000)
                        except:
                            # Last resort: click via JS
                            btn.evaluate("el => el.click()")
                        time.sleep(2)
                print(f"[{vendor_name}] Cart cleared manually")
            else:
                print(f"[{vendor_name}] Cart is already empty")
            return True
        except Exception as e:
            print(f"[{vendor_name}] Error clearing cart: {e}")
            return False

    def clear_evelta_cart(self, page: Page) -> bool:
        """Clear Evelta (BigCommerce) cart"""
        try:
            print("[EVELTA] Navigating to cart to clear existing items...")
            page.goto("https://www.evelta.com/cart.php", wait_until="domcontentloaded", timeout=30000)
            time.sleep(2)
            
            empty_btn = page.locator("a:has-text('Empty Cart'), button:has-text('Empty Cart'), a:has-text('Clear Cart')").first
            if empty_btn.count() > 0 and empty_btn.is_visible(timeout=3000):
                print("[EVELTA] Found 'Empty Cart' button. Clicking...")
                page.on("dialog", lambda dialog: dialog.accept())
                empty_btn.click(force=True)
                time.sleep(4)
                print("[EVELTA] Cart cleared via button")
                return True
            
            # Manual removal for BigCommerce
            remove_links = page.locator("a[data-cart-itemid], a:has-text('Remove')").all()
            if remove_links:
                print(f"[EVELTA] Found {len(remove_links)} items. Removing manually...")
                for _ in range(len(remove_links)):
                    btn = page.locator("a[data-cart-itemid], a:has-text('Remove')").first
                    if btn.count() > 0:
                        btn.click(force=True)
                        time.sleep(2)
                print("[EVELTA] Cart cleared manually")
            else:
                print("[EVELTA] Cart is already empty")
            return True
        except Exception as e:
            print(f"[EVELTA] Error clearing cart: {e}")
            return False

    # -------------------------------------------------------------------------
    # Session & Login Helpers
    # -------------------------------------------------------------------------
    def _ensure_logged_in(self, page: Page, vendor_name: str, product_url: str) -> bool:
        """Check if logged in, and if not, perform JIT login."""
        vendor_upper = vendor_name.upper()
        
        # Selectors to check login status
        # If we see these, we are likely logged in
        logged_in_selectors = [
            "a:has-text('Logout')", "a:has-text('Log out')", "a:has-text('Log Out')", 
            "a:has-text('Sign Out')", ".woocommerce-MyAccount-navigation-link--customer-logout",
            "a[href*='logout']", ".navUser-item--account a[href*='logout']"
        ]
        
        # If we see these, we are likely logged out
        logged_out_selectors = [
            "a:has-text('Login')", "a:has-text('Log In')", "a:has-text('Sign In')",
            "a:has-text('Register')", "a[href*='login']", "a[href*='register']",
            ".navUser-item--account a[href*='login']"
        ]
        
        is_logged_in = False
        # 1. Try to find any logged_in indicator
        for sel in logged_in_selectors:
            try:
                if page.locator(sel).count() > 0:
                    is_logged_in = True
                    break
            except: continue
        
        # 2. If not clearly logged in, check for logged_out indicators
        if not is_logged_in:
            is_logged_out = False
            for sel in logged_out_selectors:
                try:
                    if page.locator(sel).count() > 0:
                        is_logged_out = True
                        break
                except: continue
            
            # 3. If neither found, wait a moment and try one last check for logout
            if not is_logged_out and not is_logged_in:
                time.sleep(2)
                if page.locator(", ".join(logged_in_selectors)).count() > 0:
                    is_logged_in = True

            # 4. Perform JIT login if logged out (or status unknown)
            if not is_logged_in:
                print(f"[{vendor_name}] ⚠️ Not logged in or session expired. Performing JIT login...")
                email = os.getenv(f"{vendor_upper}_EMAIL")
                password = os.getenv(f"{vendor_upper}_PASSWORD")
                
                login_url_map = {
                    "ROBU":   "https://robu.in/my-account/",
                    "KTRON":  "https://ktron.in/my-account/",
                    "SHARVI": "https://sharvielectronics.com/my-account/",
                    "EVELTA": "https://evelta.com/login.php",
                    "ELEVTA": "https://evelta.com/login.php"
                }
                login_url = login_url_map.get(vendor_upper)
                
                if email and password and login_url:
                    state_path = SESSION_DIR / f"{vendor_name.lower()}_state.json"
                    success = self.login_and_save_state(page, email, password, login_url, state_path, vendor_name)
                    if success:
                        print(f"[{vendor_name}] ✅ JIT login successful. Returning to product.")
                        page.goto(product_url, wait_until="domcontentloaded", timeout=30000)
                        time.sleep(2)
                        return True
                    else:
                        print(f"[{vendor_name}] ❌ JIT login failed.")
                        return False
                else:
                    print(f"[{vendor_name}] ❌ Missing credentials or login URL for JIT login.")
                    return False
        
        return True

    # -------------------------------------------------------------------------
    # Generic WooCommerce login — works for Evelta, Ktron, Sharvi
    # -------------------------------------------------------------------------
    def login_and_save_state(self, page: Page, email: str, password: str,
                               login_url: str, state_path: Path, vendor_name: str) -> bool:
        """Login to a WooCommerce site and save session cookies to a JSON file."""
        try:
            print(f"[{vendor_name}] Navigating to login page...")
            page.goto(login_url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(3)
            
            # Dismiss any popups (Allow/Cancel notifications) twice to be sure
            self._dismiss_popups(page)
            time.sleep(2)
            self._dismiss_popups(page)

            # Already logged in?
            if page.locator(
                "a:has-text('Logout'), a:has-text('logout'), "
                ".woocommerce-MyAccount-navigation-link--customer-logout"
            ).count() > 0:
                print(f"[{vendor_name}] Already logged in — saving state")
                SESSION_DIR.mkdir(parents=True, exist_ok=True)
                page.context.storage_state(path=str(state_path))
                return True

            # Find email/username field (WooCommerce + BigCommerce selectors)
            user_field = None
            for sel in [
                "input[name='login_email']",   # BigCommerce
                "input#email",                  # BigCommerce fallback
                "input[name='username']",       # WooCommerce
                "input[name='email']",
                "input[id='username']",
                "input[type='email']",
            ]:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible():
                    user_field = loc
                    break

            if not user_field:
                print(f"[{vendor_name}] ❌ Could not find login field")
                return False

            print(f"[{vendor_name}] Logging in as {email}...")
            user_field.fill(email)

            # Find password field (WooCommerce + BigCommerce selectors)
            pass_field = None
            for sel in [
                "input[name='login_pass']",    # BigCommerce
                "input#pass",                   # BigCommerce fallback
                "input[name='password']",       # WooCommerce
                "input[type='password']",
            ]:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible():
                    pass_field = loc
                    break

            if not pass_field:
                print(f"[{vendor_name}] ❌ Could not find password field")
                return False

            pass_field.fill(password)

            # Dismiss any popups that appeared while typing (OneSignal etc.)
            self._dismiss_popups(page)

            # Click the login submit — scoped to login form to avoid Search button
            login_clicked = False
            for sel in [
                "button[name='login']",
                ".woocommerce-form-login button[type='submit']",
                "form.woocommerce-form-login input[type='submit']",
                "form[class*='login'] button[type='submit']",
                "input[name='login'][type='submit']",
                "button.woocommerce-button[type='submit']",
                # BigCommerce
                "input[type='submit'][value*='Sign In']",
                "button[type='submit'][id*='login']",
            ]:
                try:
                    btn = page.locator(sel).first
                    if btn.count() > 0 and btn.is_visible(timeout=1500):
                        btn.click(force=True)
                        login_clicked = True
                        print(f"[{vendor_name}] Clicked login via: {sel}")
                        break
                except Exception:
                    continue

            if not login_clicked:
                print(f"[{vendor_name}] ⚠️ Could not find login button — trying keyboard Enter")
                pass_field.press("Enter")

            page.wait_for_load_state("domcontentloaded")
            time.sleep(4)

            # --- VERIFY LOGIN SUCCESS ---
            is_success = page.locator(
                "a:has-text('Logout'), a:has-text('Log out'), a:has-text('Log Out'), "
                ".woocommerce-MyAccount-navigation-link--customer-logout, "
                "a[href*='logout']"
            ).count() > 0
            
            if not is_success:
                # Check for explicit error messages
                error_box = page.locator(".woocommerce-error, .alertBox--error, .alert-danger").first
                err_msg = ""
                if error_box.count() > 0 and error_box.is_visible():
                    err_msg = f": {error_box.inner_text().strip()}"
                
                print(f"[{vendor_name}] ❌ Login verification failed{err_msg}")
                # Take a screenshot for debugging if it's Ktron (likely reCAPTCHA)
                if vendor_name.upper() == "KTRON":
                    os.makedirs("auto", exist_ok=True)
                    page.screenshot(path="auto/ktron_login_failed.png")
                    print(f"[{vendor_name}] 📸 Saved debug screenshot to auto/ktron_login_failed.png")
                return False

            # Verify & save
            print(f"[{vendor_name}] ✅ Login successful — saving session state")
            SESSION_DIR.mkdir(parents=True, exist_ok=True)
            page.context.storage_state(path=str(state_path))
            print(f"[{vendor_name}] Session saved → {state_path}")
            return True

        except Exception as e:
            print(f"[{vendor_name}] Login error: {e}")
            return False

    # -------------------------------------------------------------------------
    # Generic WooCommerce add-to-cart — works for Evelta, Ktron, Sharvi
    # -------------------------------------------------------------------------
    def add_to_cart_woocommerce(self, page: Page, product_url: str,
                                 quantity: int, vendor_name: str, item_name: str = "", unit_price: float = 0.0) -> Dict:
        """Add a WooCommerce product to cart (quantity-aware)."""
        try:
            print(f"[{vendor_name}] 🛒 Adding {quantity}x → {product_url}")
            page.goto(product_url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(random.uniform(2.0, 3.0))

            # --- JIT Login Check ---
            login_ok = self._ensure_logged_in(page, vendor_name, product_url)
            if not login_ok:
                print(f"[{vendor_name}] ❌ Aborting add-to-cart: Could not verify logged-in session.")
                return {"success": False, "message": "Login verification failed", "cart_url": product_url}

            # Dismiss popups before interacting (OneSignal etc.)
            self._dismiss_popups(page)

            page.evaluate("window.scrollTo(0, 500)")

            # --- Proactive MOQ Scraping (Sharvi & Ktron) ---
            if vendor_name.upper() in ["SHARVI", "KTRON"]:
                try:
                    summary_text = page.locator(".summary, .entry-summary").inner_text()
                    # Check for "Minimum quantity: X", "Pack of X", or "Minimum Order Qty: X"
                    m_moq = re.search(r"(?:Minimum\s*(?:Order\s*)?quantity|Minimum\s*Order\s*Qty|Pack\s*of|MOQ)\s*[:\-]?\s*(\d+)", summary_text, re.IGNORECASE)
                    if m_moq:
                        scraped_moq = int(m_moq.group(1))
                        if quantity < scraped_moq:
                            print(f"[{vendor_name}] 🔍 Scraped proactive MOQ: {scraped_moq}. Adjusting quantity from {quantity} to {scraped_moq}.")
                            quantity = scraped_moq
                except Exception:
                    pass

            # ── Set quantity ──
            for sel in ["input[name='quantity']", "input.qty", "input[type='number']"]:
                try:
                    inp = page.locator(sel).first
                    if inp.is_visible(timeout=4000):
                        inp.click(click_count=3)
                        time.sleep(0.2)
                        
                        # Use fill instead of digit-by-digit for speed and accuracy
                        inp.fill(str(quantity))

                        # Force trigger events to ensure React/JS logic updates accurately
                        page.evaluate("""(data) => {
                            let el = document.querySelector(data.sel);
                            if (el) {
                                el.value = data.val;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }""", {"sel": sel, "val": str(quantity)})

                        print(f"[{vendor_name}] Quantity set to {quantity}")
                        break
                except Exception:
                    continue

            time.sleep(0.5)

            # ── Click Add to Cart ──
            for sel in [
                "button.single_add_to_cart_button",
                "button[name='add-to-cart']",
                "button:has-text('Add to cart')",
                "button:has-text('Add to Cart')",
                ".add_to_cart_button",
            ]:
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=4000):
                        btn.scroll_into_view_if_needed()
                        time.sleep(0.2)
                        btn.click(force=True)
                        print(f"[{vendor_name}] Clicked Add to Cart")
                        break
                except Exception:
                    continue

            # ── SHARVI/Generic: Detect Validation Error or 'min' attribute BEFORE navigation ──
            time.sleep(2.0)
            try:
                moq_detected = None
                
                # Check 1: Input 'min' attribute (Most reliable)
                qty_input = page.locator("input.qty, input[name='quantity']").first
                if qty_input.count() > 0:
                    min_attr = qty_input.get_attribute("min")
                    if min_attr and int(min_attr) > quantity:
                        moq_detected = int(min_attr)
                        print(f"[{vendor_name}] 🔍 Detected MOQ from input 'min' attribute: {moq_detected}")

                # Check 2: Validation Message (Fallback)
                if not moq_detected:
                    validation_msg = page.locator("text=greater than or equal to").first
                    if validation_msg.count() > 0 and validation_msg.is_visible(timeout=500):
                        err_text = validation_msg.inner_text().strip()
                        print(f"[{vendor_name}] ⚠️ Detected MOQ from validation text: '{err_text}'")
                        moq_m = re.search(r"greater than or equal to (\d+)", err_text, re.IGNORECASE)
                        if moq_m:
                            moq_detected = int(moq_m.group(1))

                # If MOQ was found and it's higher than our qty, RE-TRY
                if moq_detected and moq_detected > quantity:
                    final_moq_qty = moq_detected
                    print(f"[{vendor_name}] ↺ Retrying with adjusted quantity: {final_moq_qty}")
                    
                    # Force fill with click + triple-click to ensure it's cleared
                    qty_input.click(click_count=3)
                    qty_input.press("Backspace")
                    qty_input.type(str(final_moq_qty), delay=50)
                    
                    # Re-trigger changes
                    page.evaluate("(val) => { let el = document.querySelector('input.qty'); if(el){ el.value=val; el.dispatchEvent(new Event('change',{bubbles:true})); } }", str(final_moq_qty))
                    
                    time.sleep(0.5)
                    # Re-click Add to Cart
                    for sel_btn in ["button.single_add_to_cart_button", "button[name='add-to-cart']"]:
                        btn_add = page.locator(sel_btn).first
                        if btn_add.is_visible():
                            btn_add.click(force=True)
                            break
                    
                    time.sleep(2)
                    quantity = final_moq_qty # Update for verification phase
            except Exception as e:
                print(f"[{vendor_name}] 🔍 Sharvi MOQ detection check skipped/failed: {e}")

            # ── Wait for confirmation or error toast (Backup) ──
            try:
                page.wait_for_selector(
                    ".woocommerce-message, .added_to_cart, "
                    "div:has-text('added to your cart'), div:has-text('added to cart'), "
                    ".woocommerce-error, .woocommerce-notices-wrapper .woocommerce-error",
                    timeout=8000
                )
                
                # Check for WooCommerce stock limit error toast
                err_loc = page.locator(".woocommerce-error, .woocommerce-notices-wrapper .woocommerce-error").first
                if err_loc.count() > 0 and err_loc.is_visible(timeout=1000):
                    err_text = err_loc.inner_text().strip()
                    import re
                    m = re.search(r"only\s*(\d+)\s*(?:units?|items?)?\s*(?:are\s*)?available", err_text, re.IGNORECASE)
                    if m:
                        available = int(m.group(1))
                        print(f"[{vendor_name}] ⚠️ Stock limit detected in cart flow: '{err_text}' — only {available} available")
                        
                        # The item was blocked from entering the cart. We must retry with the valid amount.
                        print(f"[{vendor_name}] ↺ Retrying cart insertion with {available} units...")
                        try:
                            # Set the input to the available amount
                            for sel in ["input[name='quantity']", "input.qty", "input[type='number']"]:
                                inp = page.locator(sel).first
                                if inp.is_visible(timeout=2000):
                                    inp.click(click_count=3)
                                    inp.fill(str(available))
                                    page.evaluate("(sel, val) => { let el = document.querySelector(sel); if(el){ el.value=val; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); } }", sel, str(available))
                                    break
                            time.sleep(0.5)
                            # Click add to cart again
                            for sel in ["button.single_add_to_cart_button", "button[name='add-to-cart']", "button:has-text('Add to cart')", "button:has-text('Add to Cart')", ".add_to_cart_button"]:
                                btn = page.locator(sel).first
                                if btn.is_visible(timeout=2000):
                                    btn.click(force=True)
                                    break
                            time.sleep(3) # Wait for retry to process
                        except Exception as e:
                            print(f"[{vendor_name}] ⚠️ Failed to auto-retry: {e}")

                        return {
                            "success": False,
                            "insufficient_stock": True,
                            "available": available,
                            "message": err_text,
                            "cart_url": product_url,
                        }

            # --- MOQ Handling (Sharvi & Ktron) ---
                    # Regex handles "greater than or equal to 50" (Sharvi) and "minimum of 50" (Ktron)
                    moq_m = re.search(r"(?:greater than or equal to|minimum of)\s*(\d+)", err_text, re.IGNORECASE)
                    if moq_m and vendor_name.upper() in ["SHARVI", "KTRON"]:
                        min_qty = int(moq_m.group(1))
                        final_moq_qty = max(quantity, min_qty)
                        print(f"[{vendor_name}] ℹ️ MOQ identified: {min_qty}. Adjusting quantity from {quantity} to {final_moq_qty}.")
                        
                        try:
                            # Set the input to the final quantity
                            for sel_qty in ["input[name='quantity']", "input.qty", "input[type='number']"]:
                                inp_qty = page.locator(sel_qty).first
                                if inp_qty.is_visible(timeout=2000):
                                    inp_qty.click(click_count=3)
                                    inp_qty.fill(str(final_moq_qty))
                                    page.evaluate("(sel, val) => { let el = document.querySelector(sel); if(el){ el.value=val; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); } }", sel_qty, str(final_moq_qty))
                                    break
                            time.sleep(0.5)
                            # Click add to cart again
                            for sel_btn in ["button.single_add_to_cart_button", "button[name='add-to-cart']", "button:has-text('Add to cart')", "button:has-text('Add to Cart')", ".add_to_cart_button"]:
                                btn_add = page.locator(sel_btn).first
                                if btn_add.is_visible(timeout=2000):
                                    btn_add.click(force=True)
                                    break
                            time.sleep(3) # Wait for retry to process
                            
                            # Verify with the new expected MOQ qty
                            cart_url_moq = "https://www.ktron.in/cart/" if vendor_name.upper() == "KTRON" else "https://sharvielectronics.com/cart/"
                            return self._verify_and_correct_cart_qty(page, cart_url_moq, item_name, quantity, product_url, expected_qty=final_moq_qty, unit_price=unit_price)
                        except Exception as e:
                            print(f"[{vendor_name}] ⚠️ Failed to auto-retry with MOQ: {e}")

                    else:
                        print(f"[{vendor_name}] ❗ Error notice: {err_text}")
                else:
                    print(f"[{vendor_name}] ✅ Cart confirmation received")
            except Exception:
                print(f"[{vendor_name}] \u26a0\ufe0f No toast \u2014 waiting 2 s")
                time.sleep(2)

            cart_url_map = {
                "KTRON": "https://ktron.in/cart/",
                "SHARVI": "https://sharvielectronics.com/cart/",
            }
            cart_url = cart_url_map.get(vendor_name.upper(), "")
            if cart_url:
                return self._verify_and_correct_cart_qty(page, cart_url, item_name, quantity, product_url, unit_price=unit_price)

            return {"success": True, "added_qty": quantity, "cart_url": product_url, "message": "Added to cart"}

        except Exception as e:
            print(f"[{vendor_name}] Cart error: {e}")
            return {"success": False, "message": f"Error adding to cart: {str(e)}", "cart_url": product_url}

    # -------------------------------------------------------------------------
    # BigCommerce add-to-cart — for Evelta (bigcommerce platform)
    # -------------------------------------------------------------------------
    def add_to_cart_bigcommerce(self, page: Page, product_url: str,
                                 quantity: int, vendor_name: str, item_name: str = "", unit_price: float = 0.0) -> Dict:
        """Add a BigCommerce product to cart (Evelta uses BigCommerce, not WooCommerce)."""
        try:
            print(f"[{vendor_name}] 🛒 [BigCommerce] Adding {quantity}x → {product_url}")
            page.goto(product_url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(2)

            # ── Check Login Status ──
            self._ensure_logged_in(page, vendor_name, product_url)

            time.sleep(random.uniform(1.0, 2.0))
            # Dismiss popups (OneSignal etc.)
            self._dismiss_popups(page)
            page.evaluate("window.scrollTo(0, 500)")
            time.sleep(0.5)

            # ── Set quantity (BigCommerce selectors) ──
            qty_set = False
            for sel in [
                "input[name='qty[]']",              # BigCommerce standard
                "input.form-input--incrementTotal", # BigCommerce theme variant
                "input[id^='qty_']",                # ID prefix variant
                "input[name='qty']",
                "input[type='number']",
            ]:
                try:
                    inp = page.locator(sel).first
                    if inp.is_visible(timeout=4000):
                        inp.click(click_count=3)
                        time.sleep(0.2)
                        
                        # Use fill instead of digit-by-digit for speed and accuracy
                        inp.fill(str(quantity))

                        # Force trigger events to ensure React/JS logic updates accurately
                        page.evaluate("""(data) => {
                            let el = document.querySelector(data.sel);
                            if (el) {
                                el.value = data.val;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }""", {"sel": sel, "val": str(quantity)})

                        print(f"[{vendor_name}] Quantity set to {quantity} via {sel}")
                        qty_set = True
                        break
                except Exception:
                    continue

            if not qty_set:
                print(f"[{vendor_name}] ⚠️ Could not set quantity — attempting with default qty")

            time.sleep(0.5)

            # ── Click Add to Cart (BigCommerce selectors) ──
            cart_clicked = False
            for sel in [
                "#form-action-addToCart",                    # BigCommerce standard ID
                "button[data-button-type='add-cart']",       # data attribute variant
                "input[type='submit'][value*='Add to Cart']",
                "input[type='submit'][value*='Add to cart']",
                ".add-to-cart-button",
                "button:has-text('Add to Cart')",
                "button:has-text('Add to cart')",
                "button:has-text('Buy Now')",
            ]:
                try:
                    btn = page.locator(sel).first
                    if btn.is_visible(timeout=4000):
                        btn.scroll_into_view_if_needed()
                        time.sleep(0.3)
                        btn.click(force=True)
                        print(f"[{vendor_name}] Clicked Add to Cart via {sel}")
                        cart_clicked = True
                        break
                except Exception:
                    continue

            if not cart_clicked:
                print(f"[{vendor_name}] ❌ Could not find Add to Cart button")
                return False

            # 🔥 NEW: Handle stock error popup (Evelta blocks cart if qty > stock)
            try:
                # Give a moment for the popup to appear
                time.sleep(1)
                popup = page.locator("text=We don't have enough")
                if popup.count() > 0 and popup.is_visible(timeout=6000):
                    print(f"[{vendor_name}] ❌ Stock popup detected: '{popup.inner_text()}'")
                    
                    # Extract available stock using targeted selectors (Evelta/BigCommerce)
                    available_qty = 0
                    try:
                        # 1. Primary: check the specific stock label found in research
                        stock_label = page.locator("label.form-label--stock span:first-child, .form-field--stock .form-label--stock span").first
                        if stock_label.count() > 0 and stock_label.is_visible(timeout=2000):
                            txt = stock_label.inner_text().strip()
                            available_qty = int(''.join(filter(str.isdigit, txt)))
                            print(f"[{vendor_name}] 🎯 Precise stock found via label: {available_qty}")
                        
                        # 2. Fallback: regex search but in a smaller scope (the product view)
                        if available_qty == 0:
                            import re
                            product_view = page.locator(".productView, .product-details").first
                            if product_view.count() > 0:
                                scope_text = product_view.inner_text()
                                m = re.search(r"(\d+)\s+in stock|only\s+(\d+)\s+available", scope_text, re.IGNORECASE)
                                if m:
                                    available_qty = int(m.group(1) or m.group(2))
                                    print(f"[{vendor_name}] 🔍 Stock found via scoped regex: {available_qty}")
                    except Exception as e:
                        print(f"[{vendor_name}] ⚠️ Failed to extract stock quantity: {e}")
                    
                    # Click OK to dismiss popup
                    page.locator("button:has-text('OK')").click()
                    time.sleep(1)
                    
                    if available_qty > 0:
                        print(f"[{vendor_name}] 🔄 Retrying with available qty: {available_qty}")
                        # Re-locate and fill the input using the same robust logic as initial attempt
                        qty_selectors = ["input[name='qty[]']", "input.form-input--incrementTotal", "input.qty", "input[type='number']", "input[name='qty']"]
                        qty_set_retry = False
                        for sel in qty_selectors:
                            try:
                                inp = page.locator(sel).first
                                if inp.count() > 0 and inp.is_visible(timeout=2000):
                                    inp.click(click_count=3)
                                    time.sleep(0.2)
                                    inp.fill(str(available_qty))
                                    # Force trigger events
                                    page.evaluate("""(data) => {
                                        let el = document.querySelector(data.sel);
                                        if (el) {
                                            el.value = data.val;
                                            el.dispatchEvent(new Event('input', { bubbles: true }));
                                            el.dispatchEvent(new Event('change', { bubbles: true }));
                                        }
                                    }""", {"sel": sel, "val": str(available_qty)})
                                    print(f"[{vendor_name}] Retry quantity set to {available_qty} via {sel}")
                                    qty_set_retry = True
                                    break
                            except: continue
                        
                        # Click add to cart again
                        add_selectors = ["#form-action-addToCart", "button[data-button-type='add-cart']", "input[type='submit'][value*='Add to Cart']", "button:has-text('Add to Cart')"]
                        for sel in add_selectors:
                            try:
                                btn = page.locator(sel).first
                                if btn.count() > 0 and btn.is_visible(timeout=2000):
                                    btn.click(force=True)
                                    print(f"[{vendor_name}] Retry Add to Cart clicked via {sel}")
                                    break
                            except: continue
                        
                        time.sleep(4) # Wait for cart addition to process
                        quantity = available_qty # Update target for verification phase
                    else:
                        print(f"[{vendor_name}] ❌ No stock available after popup")
                        return {"success": False, "message": "No stock available", "cart_url": product_url}
            except Exception as e:
                print(f"[{vendor_name}] ⚠️ Popup handling error: {e}")

            # ── Wait for confirmation (BigCommerce shows cart preview / modal) ──
            time.sleep(2)
            try:
                page.wait_for_selector(
                    ".cart-preview, .previewCartList, "
                    ".alertBox--success, .cart-added, "
                    "[data-cart-status], .modal--isOpen",
                    timeout=8000
                )
                print(f"[{vendor_name}] ✅ Cart confirmation received")
                
                # Dismiss modal if present (Evelta requirement)
                try:
                    continue_btn = page.locator("button:has-text('Continue Shopping'), a:has-text('Continue Shopping')").first
                    if continue_btn.count() > 0 and continue_btn.is_visible(timeout=3000):
                        continue_btn.click()
                        time.sleep(1)
                except: pass
            except Exception:
                print(f"[{vendor_name}] ⚠️ No cart confirmation toast — assuming success")
                time.sleep(2)

            cart_url = "https://www.evelta.com/cart.php"
            if vendor_name.upper() in ("EVELTA", "ELEVTA"):
                return self._verify_and_correct_cart_qty(page, cart_url, item_name, quantity, product_url, unit_price=unit_price)

            return {"success": True, "cart_url": product_url, "message": "Added to cart"}

        except Exception as e:
            print(f"[{vendor_name}] BigCommerce cart error: {e}")
            return {"success": False, "message": f"Error adding to cart: {str(e)}", "cart_url": product_url}
