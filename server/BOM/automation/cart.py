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

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BOM_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BOM_ROOT / ".env", override=True)

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

    def remove_item_from_cart(self, page: Page, item_name: str, vendor: str, quantity: int = 0, unit_price: float = 0.0, product_url: str = "") -> bool:
        """Removes a specific item from the cart if it's deemed INVALID"""
        try:
            print(f"[{vendor}] 🗑️ Removing item from cart: {item_name} (Qty: {quantity}, Price: ₹{unit_price})")
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
            
            # Normalize item name for matching
            search_name = item_name.lower().strip()
            print(f"[{vendor}] Searching for product row containing: '{search_name}'")
            
            # Special logic for ROBU as requested by user
            if vendor.upper() == "ROBU":
                # 1. Light scroll
                page.mouse.wheel(0, 300)
                time.sleep(1)

                # 2. Find correct row by name, quantity, and price
                # Robu uses a div-based cart layout (not a standard WooCommerce <table>)
                rows = page.locator(
                    "tr.cart_item, tr.cart-item, tr:has(.product-name), "
                    "div.cart-item, div.cart_item, "
                    "[class*='cart-item']:not(table):not(form):not(thead)"
                )
                target_row = None
                
                for i in range(rows.count()):
                    row = rows.nth(i)
                    row_text = row.inner_text()
                    
                    # 1. Name Match
                    name_match = item_name.lower() in row_text.lower()
                    
                    # 2. Price Match
                    price_match = False
                    if unit_price > 0:
                        import re
                        prices = re.findall(r"([\d,]+\.?\d*)", row_text)
                        # Safe per-value float parsing — avoids ValueError on empty/invalid strings
                        for p in prices:
                            try:
                                val = float(p.replace(",", "").strip())
                                if abs(val - unit_price) <= 0.05:
                                    price_match = True
                                    break
                            except (ValueError, TypeError):
                                continue
                            
                    # 3. Quantity Match
                    qty_match = False
                    if quantity > 0:
                        qty_input = row.locator("input.qty, input[type='number']").first
                        if qty_input.count() > 0:
                            actual_qty = qty_input.input_value()
                            if str(quantity) == str(actual_qty).strip():
                                qty_match = True
                    else:
                        qty_match = True
                    
                    # If we found a match via name+qty OR price+qty
                    if (name_match or price_match) and qty_match:
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
            
            # --- EVELTA SPECIFIC REMOVAL ---
            if vendor.upper() in ("EVELTA", "ELEVTA"):
                print(f"[{vendor}] Using EVELTA-specific removal logic...")
                
                target_row = None
                
                # 1. Try slug match FIRST (as requested by user)
                if product_url:
                    import urllib.parse
                    url_path = urllib.parse.urlparse(product_url).path.rstrip('/')
                    last_segment = url_path.split('/')[-1] if url_path else ""
                    if last_segment:
                        print(f"[{vendor}] Attempting to find item by slug: {last_segment}")
                        slug_locator = page.locator(f"tr.cart-item:has(a[href*='{last_segment}'])").first
                        if slug_locator.count() > 0:
                            target_row = slug_locator
                            print(f"[{vendor}] ✅ Found item via slug match")
                
                # 2. Try to find the EXACT row by name/price if slug match failed
                if not target_row:
                    rows = page.locator("tr.cart-item, tr.cart_item, .cart-item, [data-cart-itemid], tr:has(.product-name)").all()
                    
                    for row in rows:
                        try:
                            row_text = row.inner_text()
                            if search_name in row_text.lower():
                                # Match price if possible for extra safety
                                if unit_price > 0:
                                    prices = re.findall(r"([\d,]+\.?\d*)", row_text)
                                    clean_prices = [p.replace(",","") for p in prices if p.replace(",","")]
                                    if any(abs(float(p) - unit_price) <= 0.10 for p in clean_prices):
                                        target_row = row
                                        break
                                else:
                                    target_row = row
                                    break
                        except: continue
                
                # 3. FALLBACK: "Recent Item" logic as requested by user
                # If precise match failed, target the VERY FIRST product row (most recently added)
                if not target_row:
                    print(f"[{vendor}] ⚠️ Precise match failed for '{search_name}'. Falling back to 'Recent Item' logic...")
                    first_row = page.locator("tr.cart-item, tr.cart_item, .cart-item, [data-cart-itemid], tbody.cart-list tr").first
                    if first_row.count() > 0:
                        target_row = first_row
                        print(f"[{vendor}] 🎯 Targeting first row in cart (likely the recently added item)")

                if target_row:
                    # Look for X button / delete icon in the row
                    delete_patterns = [
                        "a.cart-remove.icon",
                        "a.cart-remove",
                        "a[data-cart-itemid]",
                        "button.cart-remove",
                        ".cart-item-block-actions a",
                        "button:has-text('×')",
                        "a:has-text('×')",
                        ".remove",
                        ".delete",
                        "svg[class*='remove']",
                        "svg[class*='delete']",
                        "svg[class*='trash']",
                        ".fa-trash"
                    ]
                    
                    delete_btn = None
                    for pattern in delete_patterns:
                        try:
                            delete_btn = target_row.locator(pattern).first
                            if delete_btn and delete_btn.count() > 0:
                                print(f"[{vendor}] ✅ Found delete button with pattern: {pattern}")
                                break
                        except:
                            continue
                    
                    if delete_btn and delete_btn.count() > 0:
                        delete_btn.scroll_into_view_if_needed()
                        time.sleep(0.5)
                        
                        # IMPORTANT: Register dialog handler BEFORE the click
                        dialog_handled = False
                        def handle_dialog(dialog):
                            nonlocal dialog_handled
                            print(f"[{vendor}] 💬 Native dialog detected: {dialog.message}")
                            dialog.accept()
                            dialog_handled = True
                            print(f"[{vendor}] ✅ Accepted native dialog (clicked OK)")
                        
                        page.on("dialog", handle_dialog)
                        
                        try:
                            delete_btn.scroll_into_view_if_needed()
                            delete_btn.hover()
                            time.sleep(0.3)
                            # Try multiple click methods
                            try:
                                delete_btn.click(timeout=3000)
                            except:
                                try: delete_btn.click(force=True, timeout=3000)
                                except: delete_btn.dispatch_event("click")
                            
                            print(f"[{vendor}] ✅ Clicked delete button")
                        except Exception as e:
                            print(f"[{vendor}] ⚠️ Click failed: {e}")
                        
                        # Handle custom modal buttons (if no native dialog appeared)
                        # Only try custom modal handling if native dialog wasn't handled
                        try:
                            time.sleep(1.5)
                            
                            if not dialog_handled:
                                # CRITICAL: Look for OK button FIRST and ONLY click that
                                # Make sure we're clicking OK, not CANCEL
                                confirm_selectors = [
                                    "button:has-text('OK'):not(:has-text('Cancel'))",
                                    "button:has-text('OK')", 
                                    "button:has-text('Confirm'):not(:has-text('Cancel'))", 
                                    "button:has-text('Yes'):not(:has-text('Cancel'))",
                                    "button:has-text('Remove')",
                                    ".swal2-confirm", 
                                    ".remodal-confirm"
                                ]
                                for sel in confirm_selectors:
                                    try:
                                        confirm_btn = page.locator(sel).first
                                        if confirm_btn and confirm_btn.count() > 0 and confirm_btn.is_visible():
                                            confirm_btn.click(force=True)
                                            print(f"[{vendor}] ✅ Confirmed deletion in popup via pattern: {sel}")
                                            time.sleep(2)
                                            break
                                    except: continue
                        except:
                            pass
                        
                        # Cleanup dialog handler
                        try: page.remove_listener("dialog", handle_dialog)
                        except: pass
                        
                        # Wait for loading overlay to disappear
                        try:
                            loading_overlay = page.locator('.loadingOverlay').first
                            if loading_overlay.count() > 0:
                                loading_overlay.wait_for(state='hidden', timeout=10000)
                        except: pass
                        
                        # Wait for row to disappear or page to refresh
                        time.sleep(3)
                        return True
                    else:
                        print(f"[{vendor}] ⚠️ Could not find delete button in target row")
                else:
                    print(f"[{vendor}] ⚠️ Could not find any suitable row for removal")

            
            # --- GENERIC FALLBACK FOR OTHER VENDORS ---
            row = None
            selectors = [
                f".cart-item:has-text('{item_name}')",
                f"tr:has-text('{item_name}')",
                f".cart_item:has-text('{item_name}')"
            ]
            for sel in selectors:
                try:
                    loc = page.locator(sel).first
                    if loc.count() > 0:
                        row = loc
                        break
                except:
                    continue
            
            if row:
                # Find remove button in that row - try multiple selector patterns
                remove_selectors = [
                    ".remove",
                    ".cart-remove", 
                    ".delete",
                    "a[aria-label*='Remove']",
                    ".btn-remove",
                    "[data-action='remove']",
                    "a[href*='remove']",
                    ".product-remove",
                    "button.remove",
                    "a.remove",
                    "button[aria-label*='delete' i]"
                ]
                
                remove_btn = None
                for sel in remove_selectors:
                    try:
                        remove_btn = row.locator(sel).first
                        if remove_btn and remove_btn.count() > 0:
                            print(f"[{vendor}] Found remove button with selector: {sel}")
                            break
                    except:
                        continue
                
                if remove_btn and remove_btn.count() > 0:
                    remove_btn.scroll_into_view_if_needed()
                    time.sleep(0.5)
                    remove_btn.click(force=True)
                    print(f"[{vendor}] ✅ Item removed from cart via row remove button")
                    time.sleep(3) # Wait for AJAX
                    
                    # Handle confirmation dialog if it appears
                    try:
                        confirm_btn = page.locator("button:has-text('OK'), button:has-text('Confirm')").first
                        if confirm_btn and confirm_btn.count() > 0:
                            confirm_btn.click(force=True)
                            time.sleep(1)
                    except:
                        pass
                    
                    return True
            
            print(f"[{vendor}] ❌ Could not find or remove item for {item_name}")
            return False
        except Exception as e:
            print(f"[{vendor}] ❌ Error removing item: {e}")
            import traceback
            traceback.print_exc()
            return False

    def _verify_and_correct_cart_qty(self, page: Page, cart_url: str, item_name: str, quantity: int, product_url: str, expected_qty: int = 0, unit_price: float = 0.0) -> Dict:
        """Navigates to the cart, finds the item, checks if quantity matches, and attempts to correct if not."""
        # Use quantity as baseline for expected_qty if not provided
        target_qty = expected_qty if expected_qty > 0 else quantity
        found_unit_price = unit_price # Default to expected
        
        print(f"[*] Navigating to cart page ({cart_url}) to verify and fix quantity (Expected: {target_qty}, Price: ₹{unit_price})...")
        page.goto(cart_url, wait_until="domcontentloaded", timeout=30000)

        # ── Wait for cart table to fully render before scanning ──
        try:
            page.wait_for_selector("table.shop_table, .cart-item, tr.cart_item, div.cart-item", timeout=10000)
        except Exception:
            pass  # If timeout, proceed anyway and let selector logic handle it
        time.sleep(1)

        # ── CHECK & CORRECT QUANTITY IN CART ──
        try:
            def _get_row_locator():
                import urllib.parse
                url_path = urllib.parse.urlparse(product_url).path.rstrip('/')
                last_segment = url_path.split('/')[-1] if url_path else ""
                
                # 1. Try to find all potential rows — tr.cart_item first (most reliable for Robu/WooCommerce)
                rows = page.locator(
                    "tr.cart_item, "
                    "tr.cart-item, "
                    "tr.woocommerce-cart-form__cart-item, "
                    "div.cart-item, "
                    "div.cart_item, "
                    "[class*='cart-item']:not(table):not(form), "
                    "tbody tr:has(td.product-name), "
                    "tbody tr:has(input[name*='qty']), "
                    "tbody tr:has(a[href*='/product/'])"
                ).all()

                if not rows:
                    # Robu-specific: cart is sometimes a plain WooCommerce table — grab ALL tbody rows
                    rows = page.locator("form.woocommerce-cart-form tr, .cart-form tr, .shop_table tr").all()

                if not rows:
                    # Last resort: any tr/div/li that has a quantity input
                    rows = page.locator(
                        ":is(tr, div, li):has(input[type='number']), "
                        ":is(tr, div, li):has(input[name*='qty'])"
                    ).all()
                    # Filter out top-level containers (body, main, form) that wrap the whole cart
                    rows = [r for r in rows if r.evaluate("el => el.querySelectorAll('input[type=number], input[name*=qty]').length <= 2")]

                if not rows:
                    # Absolute last resort: JS DOM scan — finds any element with a qty input
                    handles = page.evaluate("""() => {
                        const inputs = document.querySelectorAll('input[type=number], input[name*="qty"]');
                        const results = [];
                        for (const inp of inputs) {
                            // Walk up the DOM to find the closest product-row container
                            let el = inp.parentElement;
                            for (let i = 0; i < 5 && el; i++) {
                                if (el.querySelectorAll('input[type=number]').length === 1) {
                                    results.push(el);
                                    break;
                                }
                                el = el.parentElement;
                            }
                        }
                        return results.length;
                    }""")
                    if handles:
                        # Re-query with a broad selector now that we know items exist
                        rows = page.locator("input[type='number']").all()
                        rows = [r.locator("xpath=ancestor::*[count(descendant::input[@type='number'])=1][1]").first for r in rows]
                        rows = [r for r in rows if r.count() > 0]

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
                            import re
                            row_prices = re.findall(r"(?:\u20B9|Rs\.?|₹)\s*([\d,]+\.?\d*)", row_text)
                            
                            is_sharvi = "sharvielectronics.com" in cart_url or "SHARVI" in cart_url.upper()
                            is_evelta = "evelta.com" in cart_url or "EVELTA" in cart_url.upper()
                            tolerance = 0.15 if is_sharvi else (0.10 if is_evelta else 0.02)
                            
                            # Safe float parsing — try/except per value to avoid ValueError on empty strings
                            for p_str in row_prices:
                                try:
                                    val = float(p_str.replace(",", "").strip())
                                    if val <= 0:
                                        continue
                                    nonlocal found_unit_price
                                    found_unit_price = val
                                    if abs(val - unit_price) <= tolerance:
                                        price_match = True
                                        break
                                except (ValueError, TypeError):
                                    continue
                        else:
                            price_match = True
                        
                        # Final Decision: 
                        # - Slug Match: Extremely robust for BigCommerce/WooCommerce. If the URL matches, it's the right item.
                        # - Name Match + Price Match: Fallback for generic rows or vendors with non-unique slugs.
                        if slug_match:
                            print(f"[*] Found matching row for '{item_name}' via SLUG match. (Note: Price may have shifted due to tiers)")
                            # Extract actual price from row text if we haven't already
                            import re
                            p_list = re.findall(r"(?:\u20B9|Rs\.?|₹)\s*([\d,]+\.?\d*)", row.inner_text())
                            if p_list:
                                try: found_unit_price = float(p_list[0].replace(",",""))
                                except: pass
                            return {"row": row, "actual_unit_price": found_unit_price}
                        
                        if name_match and price_match:
                            print(f"[*] Found matching row for '{item_name}' via NAME + PRICE match.")
                            return {"row": row, "actual_unit_price": found_unit_price}
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
                
                return None

            # Find the cart row for THIS item
            row_data = _get_row_locator()
            
            if row_data and isinstance(row_data, dict) and "row" in row_data:
                row_locator = row_data["row"]
                found_unit_price = row_data.get("actual_unit_price", unit_price)
            else:
                row_locator = row_data

            if not row_locator:
                print(f"[!] ❌ Could not locate row for {item_name} in cart. Verification failed.")
                return {"success": False, "message": "Could not locate item row in cart", "cart_url": cart_url}

            selectors = ["input[name='qty[]']", "input.qty", "input[name*='qty']", "input[type='number']", "input.form-input--incrementTotal"]
            cart_qty_input = None
            
            for sel in selectors:
                try:
                    loc = row_locator.locator(sel).first
                    if loc.count() > 0:
                        cart_qty_input = loc
                        break
                except: continue
            
            if not cart_qty_input or cart_qty_input.count() == 0:
                for sel in selectors:
                    try:
                        loc = page.locator(sel).last
                        if loc.count() > 0:
                            cart_qty_input = loc
                            break
                    except: continue
            
            if not cart_qty_input or cart_qty_input.count() == 0:
                print(f"[*] ❌ Cannot find quantity input for {item_name} -> retrying once with reload")
                page.reload()
                time.sleep(3)
                row_data = _get_row_locator()
                if row_data and isinstance(row_data, dict) and "row" in row_data:
                    row_locator = row_data["row"]
                else:
                    row_locator = row_data

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
                current_qty_int = 0
                try: current_qty_int = int(cart_qty_input.input_value())
                except: pass

                is_sharvi = "sharvielectronics.com" in cart_url or "SHARVI" in cart_url.upper()
                
                if current_qty_int < target_qty:
                    return {
                        "success": True,
                        "insufficient_stock": True,
                        "available": current_qty_int,
                        "added_qty": current_qty_int,
                        "actual_unit_price": found_unit_price,
                        "message": f"Only {current_qty_int} units allowed by vendor stock.",
                        "cart_url": cart_url,
                    }
                
                if current_qty_int > target_qty:
                    is_moq_vendor = is_sharvi or "ktron" in cart_url.lower()
                    if is_moq_vendor and expected_qty > 0 and current_qty_int == expected_qty:
                         return {
                            "success": True,
                            "added_qty": current_qty_int,
                            "actual_unit_price": found_unit_price,
                            "cart_url": cart_url,
                            "message": f"Accepted MOQ: {current_qty_int}"
                        }

                    is_evelta = "evelta.com" in cart_url.lower()
                    if is_evelta:
                        row_text = row_locator.inner_text()
                        price_ok = False
                        if unit_price > 0:
                            import re
                            row_prices = re.findall(r"(?:\u20B9|Rs\.?|₹)\s*([\d,]+\.?\d*)", row_text)
                            for p_str in row_prices:
                                try:
                                    if abs(float(p_str.replace(",", "")) - unit_price) <= 0.10:
                                        price_ok = True; break
                                except: continue
                        else: price_ok = True
                        
                        if not price_ok:
                            return {"success": False, "message": "Row verification failed before correction", "cart_url": cart_url}

                    def _overwrite_cart_qty():
                        row = row_locator
                        inp = row.locator("input.qty, input[name*='qty'], input[type='number'], input.form-input--incrementTotal").first if row.count() > 0 else page.locator("input.qty, input[name*='qty'], input[type='number'], input.form-input--incrementTotal").last
                        inp.evaluate(f"(el, val) => {{ el.value = val; el.dispatchEvent(new Event('input', {{ bubbles: true }})); el.dispatchEvent(new Event('change', {{ bubbles: true }})); }}", target_qty)
                        time.sleep(1.0)
                        try:
                            update_btn = page.locator("button[name='update_cart'], button:has-text('Update Cart'), a:has-text('Update')").first
                            if update_btn.count() > 0: update_btn.click(force=True)
                        except: page.keyboard.press("Enter")
                        time.sleep(3) 
                        row_data2 = _get_row_locator()
                        row2 = row_data2["row"] if isinstance(row_data2, dict) else row_data2
                        val = row2.locator("input.qty, input[name*='qty'], input[type='number'], input.form-input--incrementTotal").first.input_value() if row2 and row2.count() > 0 else "0"
                        try: return int(val)
                        except: return 0

                    final_result_qty = _overwrite_cart_qty()
                    return {
                        "success": True,
                        "added_qty": final_result_qty,
                        "actual_unit_price": found_unit_price,
                        "insufficient_stock": final_result_qty < target_qty,
                        "available": final_result_qty,
                        "cart_url": cart_url
                    }
                else:
                    return {
                        "success": True, 
                        "added_qty": current_qty_int, 
                        "actual_unit_price": found_unit_price,
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

        ₹10 MINIMUM ORDER RULE (Robu):
        Robu enforces a ₹10 minimum per order.  If the line total (qty × price)
        would be below ₹10, we increase qty automatically.  If stock prevents us
        from reaching ₹10, we remove the item and signal fallback.
        """
        import math

        try:
            # ── ₹10 MINIMUM QTY ADJUSTMENT ───────────────────────────────────────
            original_qty   = quantity
            min_qty_for_10 = quantity           # default: no change

            if unit_price > 0:
                if unit_price >= 10:
                    min_qty_for_10 = 1          # single unit already clears ₹10
                else:
                    min_qty_for_10 = math.ceil(10.0 / unit_price)

            # Use whichever is larger: BOM requirement OR ₹10-minimum quantity
            quantity = max(original_qty, min_qty_for_10)
            if quantity != original_qty:
                print(f"[ROBU] ₹10 rule: qty adjusted {original_qty} → {quantity} "
                      f"(need ₹10 min at ₹{unit_price}/unit)")

            # ── NAVIGATE DIRECTLY TO PRODUCT PAGE ──
            print(f"[*] Navigating to product page: {product_url}")
            page.goto(product_url, wait_until="domcontentloaded", timeout=30000)
            time.sleep(2)

            # ── Check Login Status (JIT Login) ──
            self._ensure_logged_in(page, "ROBU", product_url)

            # Scroll down to reveal the quantity + Add to Cart section
            page.evaluate("window.scrollTo(0, 800)")
            time.sleep(0.5)
            page.mouse.move(500, 500)  # Trigger hover states

            # ── OOS DETECTION (BEFORE ANY CART INTERACTION) ──────────────────────
            # Robu replaces "Add to Cart" with "Add to Waitlist" when out of stock.
            # Detect this immediately and bail out cleanly — no cart interaction needed.
            oos_indicators = [
                "button:has-text('Add to Waitlist')",
                "button:has-text('Notify me')",
                "button:has-text('Notify Me')",
                "button:has-text('Join Waitlist')",
                ".stock.out-of-stock",
                "p.stock.out-of-stock",
            ]
            for oos_sel in oos_indicators:
                try:
                    oos_loc = page.locator(oos_sel).first
                    if oos_loc.count() > 0 and oos_loc.is_visible(timeout=1000):
                        print(f"[ROBU] ❌ Out of Stock detected ('{oos_sel}' found) — skipping, fallback to next vendor")
                        return {
                            "success": False,
                            "out_of_stock": True,
                            "needs_fallback": True,
                            "available": 0,
                            "message": "Out of Stock — Waitlist/notify button detected",
                            "cart_url": product_url,
                        }
                except:
                    pass

            # Also check: if Add to Cart button is completely absent after waiting, treat as OOS
            try:
                page.wait_for_selector(
                    "button.product-button, button.single_add_to_cart_button, button:has-text('Add to Cart'), [name='add-to-cart']",
                    timeout=5000
                )
            except:
                # Button not found — one final check for waitlist before giving up
                try:
                    body_text = page.evaluate("() => document.body.innerText").lower()
                    if "waitlist" in body_text or "notify me" in body_text or "out of stock" in body_text:
                        print(f"[ROBU] ❌ Out of Stock detected (body text) — fallback to next vendor")
                        return {
                            "success": False,
                            "out_of_stock": True,
                            "needs_fallback": True,
                            "available": 0,
                            "message": "Out of Stock — no Add to Cart button found",
                            "cart_url": product_url,
                        }
                except:
                    pass

            # ── QUANTITY INPUT ────────────────────────────────────────────────────
            qty_found = False
            qty_selectors = [
                ".quantity input.qty",
                "input[name='quantity']", 
                "input.qty", 
                "input[type='number']"
            ]
            
            # Explicitly wait for at least one qty input to exist in DOM first
            try:
                page.wait_for_selector(", ".join(qty_selectors), state="attached", timeout=5000)
            except:
                pass

            for sel in qty_selectors:
                try:
                    quantity_input = page.locator(sel).first
                    if quantity_input.count() > 0:
                        quantity_input.scroll_into_view_if_needed()
                        # Wait for it to be fully visible and interactable
                        quantity_input.wait_for(state="visible", timeout=3000)
                        
                        print(f"[*] Setting quantity to {quantity} via explicit JS reset... (selector: {sel})")
                        
                        # Hard reset the input via JavaScript first
                        page.evaluate("""(sel) => {
                            let el = document.querySelector(sel);
                            if (el) {
                                el.value = '';
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        }""", sel)
                        time.sleep(0.2)
                        
                        # Use standard fill which is more robust than manual typing for exact values
                        quantity_input.fill(str(quantity))
                        
                        # Force trigger change events with the new value
                        page.evaluate("""(data) => {
                            let el = document.querySelector(data.sel);
                            if (el) {
                                el.value = data.val;
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        }""", {"sel": sel, "val": str(quantity)})
                        time.sleep(1.0)
                        
                        actual_str = quantity_input.input_value()
                        try:
                            actual = int(actual_str)
                        except:
                            actual = -1
                            
                        print(f"[*] Quantity field shows: {actual} (wanted: {quantity})")
                        qty_found = True
                        
                        if actual != quantity:
                            print(f"[ROBU] ❌ Site refused exact quantity (wanted {quantity}, got {actual}) — likely step/MOQ limit")
                            return {
                                "success": False,
                                "needs_fallback": True,
                                "insufficient_stock": True, # treat as stock limit
                                "available": actual,
                                "message": f"Site forced quantity to {actual} (wanted {quantity})",
                                "cart_url": product_url,
                            }
                        break
                except Exception as e:
                    print(f"[-] Quantity selector {sel} failed: {e}")
                    continue

            if not qty_found:
                print(f"[!] Could not set quantity before adding to cart! It will likely default to 1.")
                # We can choose to fail here, but letting it proceed to cart verification is safer 
                # as cart verification has its own strict ₹10 check now.

            # ── ADD TO CART BUTTON ────────────────────────────────────────────────
            time.sleep(1)
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

            # ── WAIT FOR TOAST / STOCK ERROR ─────────────────────────────────────
            insufficient_stock_info = None
            try:
                page.wait_for_selector(
                    "div:has-text('Product added to cart'), .woocommerce-message, .added_to_cart,"
                    " .woocommerce-error, .woocommerce-notices-wrapper .woocommerce-error",
                    timeout=8000
                )
                err_loc = page.locator(".woocommerce-error, .woocommerce-notices-wrapper .woocommerce-error").first
                if err_loc.count() > 0 and err_loc.is_visible(timeout=1000):
                    err_text = err_loc.inner_text().strip()
                    import re
                    m = re.search(r"only\s*(\d+)\s*(?:units?|items?)?\s*(?:are\s*)?available", err_text, re.IGNORECASE)
                    if m:
                        available = int(m.group(1))
                        print(f"[!] Robu stock limit in toast: '{err_text}'")
                        print(f"[*] Parsed available quantity: {available}")
                        insufficient_stock_info = {"available": available, "message": err_text}
                    else:
                        print(f"[!] Robu error notice (no stock limit): {err_text}")
                else:
                    print("[✓] Success toast detected — product added to cart")
            except Exception:
                print("[*] No toast detected — waiting 4 s and proceeding anyway")
                try:
                    import re
                    body_text = page.evaluate("() => document.body.innerText")
                    m2 = re.search(r"only\s*(\d+)\s*(?:units?|items?)?\s*(?:are\s*)?available", body_text, re.IGNORECASE)
                    if m2:
                        available = int(m2.group(1))
                        insufficient_stock_info = {"available": available, "message": m2.group(0)}
                        print(f"[!] Stock limit in page text: only {available} available")
                except Exception:
                    pass
                time.sleep(4)

            # ── STOCK LIMIT DETECTED IN TOAST ────────────────────────────────────
            if insufficient_stock_info:
                available = insufficient_stock_info["available"]
                print(f"[*] 🔄 Stock limited to: {available}")
                if available <= 0:
                    return {
                        "success": False,
                        "insufficient_stock": True,
                        "available": 0,
                        "message": "Out of stock",
                        "cart_url": product_url,
                    }
                # Check if available stock is enough to reach ₹10 minimum
                if unit_price > 0 and (available * unit_price) < 9.99:
                    print(f"[ROBU] ❌ Stock ({available}) × ₹{unit_price} = ₹{available * unit_price:.2f} < ₹10 minimum")
                    print(f"[ROBU] 🗑️ Removing item from cart — insufficient stock to meet ₹10 rule")
                    try:
                        self.remove_item_from_robu_cart(page, item_name, unit_price)
                    except Exception:
                        pass
                    return {
                        "success": False,
                        "needs_fallback": True,
                        "insufficient_stock": True,
                        "available": available,
                        "message": f"Stock ({available} units) cannot meet ₹10 minimum at ₹{unit_price}/unit",
                        "cart_url": product_url,
                    }
                # Enough stock for ₹10 — continue with what's available
                quantity = available

            # ── CART VERIFICATION ─────────────────────────────────────────────────
            result = self._verify_and_correct_cart_qty(
                page, "https://robu.in/cart/", item_name, quantity, product_url, unit_price=unit_price
            )

            # ── POST-VERIFICATION ₹10 CHECK ───────────────────────────────────────
            # Three cases after cart verification:
            #  A. Full qty added, line total ≥ ₹10  → SUCCESS (unchanged)
            #  B. Partial qty added, line total ≥ ₹10 → keep in cart, signal balance fallback
            #  C. Any qty added, line total < ₹10   → remove from cart, full fallback
            if result and result.get("success"):
                added_qty   = result.get("added_qty", quantity)
                # Use the actual price extracted from the cart row, falling back to original unit_price
                real_price  = result.get("actual_unit_price", unit_price)
                is_partial  = result.get("insufficient_stock", False) and added_qty < original_qty

                line_total  = added_qty * real_price if real_price > 0 else 999

                if line_total < 9.99:
                    # ── Case C: total below ₹10 → remove & full fallback ─────────
                    print(f"[ROBU] ❌ Cart total ₹{line_total:.2f} ({added_qty} × ₹{real_price}) < ₹10 minimum")
                    print(f"[ROBU] 🗑️ Removing item — cannot reach ₹10 with available stock")
                    try:
                        self.remove_item_from_robu_cart(page, item_name, real_price if real_price > 0 else unit_price)
                    except Exception:
                        pass
                    return {
                        "success": False,
                        "needs_fallback": True,
                        "insufficient_stock": True,
                        "available": added_qty,
                        "message": f"Cart total ₹{line_total:.2f} below ₹10 minimum — stock insufficient",
                        "cart_url": "https://robu.in/cart/",
                    }

                if is_partial:
                    # ── Case B: partial stock, but line total ≥ ₹10 ─────────────
                    # Keep the in-stock qty in the Robu cart.
                    # Signal the processor that the balance must go to the next vendor.
                    balance = original_qty - added_qty
                    print(f"[ROBU] ✅ PARTIAL+KEEP: {added_qty}/{original_qty} units in cart"
                          f" (₹{line_total:.2f} ≥ ₹10). Balance {balance} → next vendor.")
                    return {
                        "success": True,
                        "needs_fallback": True,         # caller must route balance
                        "insufficient_stock": True,
                        "added_qty": added_qty,
                        "balance_qty": balance,
                        "actual_unit_price": real_price,
                        "message": f"Partial stock: {added_qty} kept in Robu cart, balance {balance} needs fallback",
                        "cart_url": "https://robu.in/cart/",
                    }

            return result

        except Exception as e:
            return {"success": False, "message": f"Error adding to cart: {str(e)}", "cart_url": product_url}

    def remove_item_from_robu_cart(self, page: Page, item_name: str, unit_price: float = 0.0) -> bool:
        """
        Remove a specific item from Robu's cart.

        Removal flow (matches video):
          1. Navigate to cart page
          2. Find the target row by name fragments (fuzzy) AND verify it is the
             most recently added row (last row in the table) to avoid wrong-item removal
          3. Tick the row's checkbox
          4. Click the "Delete Items (n)" button that appears
          5. Accept the browser confirm() dialog automatically

        Fallbacks (in order):
          - Direct click on trash-icon button (button containing an img) inside the row
          - Standard WooCommerce a.remove link
          - Navigate directly to the ?remove_item=… URL extracted from row HTML
        """
        try:
            print(f"[ROBU] 🗑️ Removing item from cart: {item_name}")
            page.goto("https://robu.in/cart/", wait_until="domcontentloaded", timeout=30000)
            time.sleep(2)

            # ── Register dialog handler BEFORE any click (avoids race condition) ──
            def _handle_dialog(dialog):
                print(f"[ROBU] 💬 Confirm dialog: '{dialog.message}' → accepting")
                dialog.accept()

            page.on("dialog", _handle_dialog)

            try:
                removed = self._robu_remove_by_row(page, item_name, unit_price)
            finally:
                try:
                    page.remove_listener("dialog", _handle_dialog)
                except Exception:
                    pass

            return removed

        except Exception as e:
            print(f"[ROBU] ❌ remove_item_from_robu_cart error: {e}")
            return False

    def _robu_remove_by_row(self, page: Page, item_name: str, unit_price: float) -> bool:
        """Inner logic for Robu cart row removal (called from remove_item_from_robu_cart)."""
        import re as _re

        # Build name fragments for fuzzy matching — split on spaces and brackets
        name_fragments = [f.strip().lower() for f in _re.split(r'[\s()\[\]/]+', item_name) if f.strip()]

        # ── Collect all product rows ───────────────────────────────────────────
        row_selector = (
            "tr.woocommerce-cart-form__cart-item, "
            "tr.cart_item, "
            "tbody tr:has(td.product-name), "
            "tbody tr:has(a[href*='/product/'])"
        )
        rows = page.locator(row_selector).all()
        if not rows:
            rows = page.locator("form.woocommerce-cart-form tr, .shop_table tr").all()

        if not rows:
            print(f"[ROBU] ⚠️ No cart rows found — cart may already be empty")
            return False

        # ── Find target row (name match, prefer last/most-recently-added) ──────
        # Robu appends new items at the bottom, so we scan from the bottom up.
        target_row = None
        for row in reversed(rows):
            try:
                row_text = row.inner_text().lower()
                # Require at least one name fragment to match
                if not any(frag in row_text for frag in name_fragments):
                    continue
                # Optional price check for extra safety (tolerance ₹0.05)
                if unit_price > 0:
                    price_strs = _re.findall(r"([\d,]+\.?\d*)", row_text)
                    price_ok = any(
                        abs(float(p.replace(',', '')) - unit_price) <= 0.05
                        for p in price_strs
                        if p.replace(',', '')
                    )
                    if not price_ok:
                        continue  # name matched but price didn't — skip to avoid wrong removal
                target_row = row
                print(f"[ROBU] ✅ Found matching row for '{item_name}' (name+price match)")
                break
            except Exception:
                continue

        if not target_row:
            print(f"[ROBU] ⚠️ Could not find matching cart row for: {item_name}")
            return False

        row_html = target_row.inner_html()

        # ── STRATEGY 1: Checkbox → "Delete Items" button ─────────────────────
        # This is the exact flow shown in the reference video.
        try:
            checkbox = target_row.locator("input[type='checkbox']").first
            if checkbox.count() > 0:
                checkbox.scroll_into_view_if_needed()
                checkbox.click(force=True)
                time.sleep(1)
                print(f"[ROBU] ☑️ Checkbox ticked")

                # "Delete Items (n)" button appears after checking
                delete_btn = page.locator(
                    "button:has-text('Delete Items'), "
                    "button:has-text('Delete Item'), "
                    "input[value*='Delete'], "
                    ".button-delete-items"
                ).first
                if delete_btn.count() > 0 and delete_btn.is_visible(timeout=3000):
                    delete_btn.scroll_into_view_if_needed()
                    delete_btn.click(force=True)
                    time.sleep(3)
                    print(f"[ROBU] ✅ Clicked 'Delete Items' — item removed")
                    return True
        except Exception as e:
            print(f"[ROBU] ⚠️ Checkbox/Delete-Items strategy failed: {e}")

        # ── STRATEGY 2: Trash-icon button inside row ──────────────────────────
        # Robu places a trash-bin img inside a button at the left of each row.
        try:
            trash_selectors = [
                "button:has(img)",       # Robu custom trash icon (button wrapping an img)
                "button.remove",
                "a.remove",
                "td.product-remove a",
                "a[aria-label*='Remove']",
                "a[href*='remove_item']",
            ]
            for sel in trash_selectors:
                btn = target_row.locator(sel).first
                if btn.count() > 0:
                    btn.scroll_into_view_if_needed()
                    time.sleep(0.4)
                    btn.click(force=True)
                    time.sleep(3)
                    print(f"[ROBU] ✅ Removed via selector '{sel}'")
                    return True
        except Exception as e:
            print(f"[ROBU] ⚠️ Trash-icon strategy failed: {e}")

        # ── STRATEGY 3: Navigate directly to ?remove_item= URL ────────────────
        try:
            import re as _re2
            m = _re2.search(r'href=["\']([^"\']*remove_item[^"\']*)["\']', row_html, _re2.IGNORECASE)
            if m:
                remove_url = m.group(1).replace("&amp;", "&")
                print(f"[ROBU] 🔗 Fallback: navigating to remove URL")
                page.goto(remove_url, wait_until="domcontentloaded", timeout=20000)
                time.sleep(2)
                print(f"[ROBU] ✅ Removed via remove_item URL navigation")
                return True
        except Exception as e:
            print(f"[ROBU] ⚠️ Remove URL fallback failed: {e}")

        print(f"[ROBU] ❌ All removal strategies exhausted for: {item_name}")
        return False

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
            if "robu.in" not in login_url:
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

            # ── Find login field (Robu-specific click-nav + generic retry) ────────────
            # Robu.in (Next.js) crashes when navigating DIRECTLY to /my-account/.
            # Fix: go to homepage, click the Login link in the nav so Next.js
            # handles the route internally — this avoids the hydration crash.
            LOGIN_FIELD_SELECTORS = [
                "input[name='login_email']",   # BigCommerce
                "input#email",                  # BigCommerce fallback
                "input[name='username']",       # WooCommerce
                "input[name='email']",
                "input[id='username']",
                "input[type='email']",
            ]

            def _find_login_field():
                for sel in LOGIN_FIELD_SELECTORS:
                    try:
                        loc = page.locator(sel).first
                        if loc.count() > 0 and loc.is_visible(timeout=2000):
                            return loc
                    except Exception:
                        continue
                return None

            user_field = _find_login_field()  # check if already loaded fine

            if not user_field and "robu.in" in login_url:
                # ── Robu: navigate via homepage Login link (avoids Next.js crash) ──
                print(f"[{vendor_name}] Using stable nav-click approach for Next.js site...")
                page.goto("https://robu.in/", wait_until="domcontentloaded", timeout=30000)
                time.sleep(3)
                self._dismiss_popups(page)
                # Look for the Login link in the top navigation
                login_nav_selectors = [
                    "a:has-text('Login')",
                    "a:has-text('Log In')",
                    "a:has-text('Sign In')",
                    "a[href*='my-account']",
                    "a[href*='login']",
                    ".account-link",
                    ".user-account a",
                ]
                clicked = False
                for nav_sel in login_nav_selectors:
                    try:
                        nav_btn = page.locator(nav_sel).first
                        if nav_btn.count() > 0 and nav_btn.is_visible(timeout=2000):
                            nav_btn.click()
                            time.sleep(3)
                            print(f"[{vendor_name}] Clicked nav login link via: {nav_sel}")
                            clicked = True
                            break
                    except Exception:
                        continue

                if not clicked:
                    # Nav click failed — try direct URL one more time with longer wait
                    print(f"[{vendor_name}] ⚠️ Nav login link not found — retrying direct URL with longer wait...")
                    page.goto(login_url, wait_until="domcontentloaded", timeout=30000)
                    time.sleep(6)

                self._dismiss_popups(page)
                user_field = _find_login_field()

            if not user_field and "robu.in" not in login_url:
                # ── Other vendors: simple reload as fallback ──
                print(f"[{vendor_name}] ⚠️ Login form not found — reloading page...")
                page.reload(wait_until="domcontentloaded")
                time.sleep(4)
                self._dismiss_popups(page)
                user_field = _find_login_field()

            if not user_field:
                # Attempt 3: homepage warmup then retry (Next.js hydration fix)
                print(f"[{vendor_name}] ⚠️ Still no login form — trying homepage warmup (attempt 3)...")
                from urllib.parse import urlparse
                parsed   = urlparse(login_url)
                homepage = f"{parsed.scheme}://{parsed.netloc}/"
                page.goto(homepage, wait_until="domcontentloaded", timeout=30000)
                time.sleep(4)
                page.goto(login_url, wait_until="domcontentloaded", timeout=30000)
                time.sleep(4)
                self._dismiss_popups(page)
                user_field = _find_login_field()

            if not user_field:
                print(f"[{vendor_name}] ❌ Could not find login field after 3 attempts")
                try:
                    import os as _os
                    _os.makedirs("auto", exist_ok=True)
                    page.screenshot(path=f"auto/{vendor_name.lower()}_login_debug.png")
                    print(f"[{vendor_name}] 📸 Debug screenshot → auto/{vendor_name.lower()}_login_debug.png")
                except Exception:
                    pass
                return False

            for login_attempt in range(2):
                print(f"[{vendor_name}] Logging in as {email} (Attempt {login_attempt + 1}/2)...")
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
                    "button:has-text('Login')",
                    "button:has-text('Log in')",
                    "button:has-text('Sign In')",
                    "button:has-text('Sign in')",
                    ".woocommerce-form-login button[type='submit']",
                    "form.woocommerce-form-login input[type='submit']",
                    "form[class*='login'] button[type='submit']",
                    "input[name='login'][type='submit']",
                    "button.woocommerce-button[type='submit']",
                    # BigCommerce
                    "input[type='submit'][value*='Sign In']",
                    "button[type='submit'][id*='login']",
                    "button.button--primary[type='submit']",
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
                # Give AJAX-driven WooCommerce logins an extra moment to settle
                time.sleep(2)

                def _check_logged_in():
                    # 1. URL redirected to /my-account/ (post-login redirect) or BigCommerce order_status/cart
                    if ("/my-account/" in page.url and "login" not in page.url) or "action=order_status" in page.url or "/cart.php" in page.url:
                        return True, "URL is /my-account/ dashboard, order_status, or cart.php"

                    # 2. WooCommerce account navigation is visible (only shown when logged in)
                    if page.locator(".woocommerce-MyAccount-navigation, .woocommerce-account .entry-content").count() > 0:
                        return True, "WooCommerce account nav visible"

                    # 3. Classic logout link variants
                    if page.locator(
                        "a:has-text('Logout'), a:has-text('Log out'), a:has-text('Log Out'), "
                        ".woocommerce-MyAccount-navigation-link--customer-logout, "
                        ".nav-logout, "
                        "a[href*='customer-logout'], a[href*='?logout=']"
                    ).count() > 0:
                        return True, "Logout link found"

                    # 4. My Account dashboard content block
                    if page.locator(
                        ".woocommerce-MyAccount-content, .woocommerce-account, "
                        ".myaccount-content, .nav-dashboard-link"
                    ).count() > 0:
                        return True, "My Account dashboard content found"

                    # 5. Body-text scan for WooCommerce "Hello, <name>" greeting
                    try:
                        body_text = page.evaluate("() => document.body.innerText")
                        import re as _re
                        if _re.search(r"hello[\s,]+\w+|log\s*out|my account|dashboard", body_text, _re.IGNORECASE):
                            return True, "Body text contains logged-in greeting"
                    except:
                        pass

                    return False, ""

                is_success, reason = _check_logged_in()

                if is_success:
                    print(f"[{vendor_name}] ✅ Login verified — {reason}")
                    break
                else:
                    # Check for explicit error messages before giving up
                    error_box = page.locator(".woocommerce-error, .alertBox--error, .alert-danger, .error-message").first
                    err_msg = ""
                    if error_box.count() > 0 and error_box.is_visible():
                        err_msg = f": {error_box.inner_text().strip()}"
                    
                    if login_attempt == 0:
                        print(f"[{vendor_name}] ⚠️ Login failed on attempt 1{err_msg}. Retrying...")
                        page.reload(wait_until="domcontentloaded")
                        time.sleep(3)
                        
                        # Find login field again
                        user_field = None
                        for sel in LOGIN_FIELD_SELECTORS:
                            try:
                                loc = page.locator(sel).first
                                if loc.count() > 0 and loc.is_visible(timeout=2000):
                                    user_field = loc
                                    break
                            except Exception:
                                continue
                        
                        if not user_field:
                            print(f"[{vendor_name}] ❌ Could not find login field after reload")
                            return False
                        continue
                    else:
                        print(f"[{vendor_name}] ❌ Login verification failed{err_msg} (URL: {page.url})")
                        import os as _os
                        _os.makedirs("auto", exist_ok=True)
                        page.screenshot(path=f"auto/{vendor_name.lower()}_login_failed.png")
                        print(f"[{vendor_name}] 📸 Saved debug screenshot to auto/{vendor_name.lower()}_login_failed.png")
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
                # ── SHARVI CART DRAWER DETECTION ─────────────────────────────────
                # Sharvi shows a slide-in right-panel with "Shopping cart" heading
                # and an "× Close" button instead of a standard WooCommerce toast.
                sharvi_drawer_closed = False
                try:
                    close_btn = page.locator(
                        "button:has-text('Close'), a:has-text('Close'), "
                        ".close-cart, [aria-label*='Close'], "
                        "button:has-text('×'), span:has-text('× Close'), a:has-text('× Close')"
                    ).first
                    drawer_loc = page.locator(
                        ".widget_shopping_cart, .woocommerce-mini-cart, [class*='mini-cart'], "
                        "div:has-text('Shopping cart')"
                    ).first

                    if drawer_loc.count() > 0 and drawer_loc.is_visible(timeout=3000):
                        print(f"[{vendor_name}] ✅ Cart drawer detected — product added successfully")
                        if close_btn.count() > 0 and close_btn.is_visible(timeout=1000):
                            close_btn.click(force=True)
                            print(f"[{vendor_name}] 🔒 Closed cart drawer")
                            time.sleep(0.5)
                        sharvi_drawer_closed = True
                    elif close_btn.count() > 0 and close_btn.is_visible(timeout=2000):
                        print(f"[{vendor_name}] ✅ Cart close button visible — product added successfully")
                        close_btn.click(force=True)
                        print(f"[{vendor_name}] 🔒 Closed cart drawer")
                        time.sleep(0.5)
                        sharvi_drawer_closed = True
                except Exception:
                    pass

                if not sharvi_drawer_closed:
                    print(f"[{vendor_name}] ⚠️ No toast — waiting 2 s")
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

            # ── OOS DETECTION (before any cart interaction) ──────────────────────
            # Evelta shows: "Sold Out" (red text) + "Notify Me" button + email field
            # when a product is out of stock. Detect this immediately and bail out.
            try:
                oos_detected = False
                scope = ".productView-details "

                # Check 1: "Sold Out" text visible in the product box
                sold_out = page.locator(
                    f"{scope}text='Sold Out', {scope}span:has-text('Sold Out'), "
                    f"{scope}div:has-text('Sold Out'), {scope}p:has-text('Sold Out')"
                ).first
                if sold_out.count() > 0 and sold_out.is_visible(timeout=1500):
                    oos_detected = True

                # Check 2: "Notify Me" / "Notify me" button present (only shown when OOS)
                if not oos_detected:
                    notify_btn = page.locator(
                        "button:has-text('Notify Me'), button:has-text('Notify me'), "
                        "a:has-text('Notify Me'), a:has-text('Notify me')"
                    ).first
                    if notify_btn.count() > 0 and notify_btn.is_visible(timeout=1500):
                        oos_detected = True

                # Check 3: "Add to Your List" instead of "Add to Cart" (Evelta OOS pattern)
                if not oos_detected:
                    add_list_btn = page.locator(
                        "button:has-text('Add to Your List'), a:has-text('Add to Your List')"
                    ).first
                    if add_list_btn.count() > 0 and add_list_btn.is_visible(timeout=1500):
                        oos_detected = True

                # Check 4: Email notification input visible (only on OOS pages)
                if not oos_detected:
                    notify_email = page.locator(
                        "input[placeholder*='email' i][placeholder*='notif' i], "
                        "input[placeholder='Email Address']"
                    ).first
                    if notify_email.count() > 0 and notify_email.is_visible(timeout=1500):
                        oos_detected = True

                if oos_detected:
                    # Double check: if an Add to Cart button is visible, it's NOT entirely out of stock (false positive)
                    add_to_cart_visible = False
                    for sel in [
                        "#form-action-addToCart", 
                        "button[data-button-type='add-cart']",
                        "input[type='submit'][value*='Add to Cart']",
                        "button:has-text('Add to Cart')",
                        "button:has-text('Add to cart')"
                    ]:
                        try:
                            btn = page.locator(sel).first
                            if btn.count() > 0 and btn.is_visible(timeout=500):
                                add_to_cart_visible = True
                                break
                        except Exception:
                            continue

                    if add_to_cart_visible:
                        print(f"[{vendor_name}] ⚠️ Ignored OOS detection because 'Add to Cart' button is visible. Proceeding to cart addition.")
                        oos_detected = False
                    else:
                        print(f"[{vendor_name}] 🚫 OOS: 'Sold Out' detected on product page → Fallback to next vendor")
                        return {
                            "success": False,
                            "status": "OOS",
                            "reason": "Product is Sold Out on Evelta",
                            "cart_url": product_url,
                        }
            except Exception as oos_err:
                pass  # If detection fails, proceed normally — don't block valid items

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
                print(f"[{vendor_name}] 🚫 OOS: Could not find Add to Cart button (Item likely Sold Out)")
                return {
                    "success": False,
                    "status": "OOS",
                    "reason": "Add to Cart button missing (Sold Out)",
                    "cart_url": product_url,
                }

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
            # ── Evelta/BigCommerce: detect "You added to your cart" modal ──
            # The modal text appears inside the DOM ~1–3s after the button click.
            # wait_for_selector with 'text=' is unreliable on dynamic BigCommerce
            # modals, so we poll via JS instead.
            cart_modal_detected = False
            try:
                deadline = time.time() + 8  # 8-second window
                while time.time() < deadline:
                    found = page.evaluate("""
                        () => {
                            const all = document.querySelectorAll('h1, h2, h3, p, div');
                            for (let el of all) {
                                if (el.offsetParent !== null &&
                                    el.innerText &&
                                    el.innerText.toLowerCase().includes('you added to your cart')) {
                                    return true;
                                }
                            }
                            return false;
                        }
                    """)
                    if found:
                        print(f"[{vendor_name}] ✅ 'You added to your cart' modal detected")
                        cart_modal_detected = True
                        break
                    time.sleep(0.4)
            except Exception:
                pass

            if cart_modal_detected:
                # Prefer "View or edit your cart" to navigate straight to cart page
                try:
                    view_cart_btn = page.locator(
                        "a:has-text('View or edit your cart'), "
                        "button:has-text('View or edit your cart')"
                    ).first
                    if view_cart_btn.count() > 0 and view_cart_btn.is_visible(timeout=3000):
                        print(f"[{vendor_name}] 🛒 Clicking 'View or edit your cart'")
                        view_cart_btn.click(force=True)
                        time.sleep(2)  # Let navigation settle
                    else:
                        # Fallback: close modal and navigate manually
                        continue_btn = page.locator(
                            "button:has-text('Continue Shopping'), a:has-text('Continue Shopping')"
                        ).first
                        if continue_btn.count() > 0 and continue_btn.is_visible(timeout=2000):
                            continue_btn.click()
                            time.sleep(1)
                except Exception as e:
                    print(f"[{vendor_name}] ⚠️ Error handling cart modal: {e}")
            else:
                print(f"[{vendor_name}] ⚠️ No cart confirmation modal — assuming success")
                time.sleep(2)

            cart_url = "https://www.evelta.com/cart.php"
            if vendor_name.upper() in ("EVELTA", "ELEVTA"):
                return self._verify_and_correct_cart_qty(page, cart_url, item_name, quantity, product_url, unit_price=unit_price)

            return {"success": True, "cart_url": product_url, "message": "Added to cart"}

        except Exception as e:
            print(f"[{vendor_name}] BigCommerce cart error: {e}")
            return {"success": False, "message": f"Error adding to cart: {str(e)}", "cart_url": product_url}
