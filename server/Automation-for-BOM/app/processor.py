import time
import random
import re
import os
import json
import math
from datetime import datetime
from pathlib import Path
import pandas as pd
from typing import Dict, Any, List
from playwright.sync_api import sync_playwright
from playwright_stealth import Stealth
import sys
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv

load_dotenv()

# Import the new automation logic
sys.path.append(os.path.abspath(os.path.join(os.getcwd(), ".")))
from automation.robu import RobuScraper
from automation.cart import CartAutomation

# --- CONFIGURATION ---
MAX_PRODUCTS = 10
HEADLESS = False
SESSION_DIR = Path(__file__).parent.parent / "session"

# --- UTILITIES ---
LOG_FILE = os.path.join(os.getcwd(), "auto", "log.txt")

def write_log(message):
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            time_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            f.write(f"[{time_now}] {message}\n")
            f.flush()
    except Exception as e:
        print(f"Logger error: {e}")

def normalize_footprint(fp):
    if not fp: return fp
    s = str(fp).strip()
    if s in ["None", "", "-", "0", "nan"]: return s
    try:
        val = int(float(s))
        return f"{val:04d}" # 603.0 -> 0603
    except:
        return s

def _parse_price_text(text):
    """Extract first valid price value from a string containing currency symbols."""
    if not text: return None
    text = text.replace(',', '')
    match = re.search(r'[\u20b9Rs\.\$]?\s*([\d,]+\.?\d*)', text)
    if match:
        try:
            val = float(match.group(1).replace(',', ''))
            if val > 0.01: return val
        except: pass
    return None

def _try_selectors(page, selectors):
    """Try each CSS selector in order, return first valid price found."""
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if loc.count() > 0:
                # Try visible first
                if loc.is_visible(timeout=1000):
                    text = loc.inner_text().strip()
                else:
                    # Fallback to hidden content if not visible
                    text = (loc.text_content() or "").strip()
                
                val = _parse_price_text(text)
                if val and val > 0.01:
                    return val
        except: continue
    return None

def extract_sharvi_price(page):
    """Extract product price from Sharvi (WooCommerce). Uses prioritized selectors."""
    try:
        # 1. Prioritize "Excluding All Taxes" anchor - most accurate for Sharvi
        try:
            # Look for the specific wording used by Sharvi in <p class="price"> or <span>
            # We use a broader search for "Excluding All Taxes" in the summary area
            summary = page.locator(".summary, .entry-summary, .product-info").first
            if summary.count() > 0:
                summary_text = summary.inner_text()
                # Pattern: ₹6.75 (Excluding All Taxes)
                m = re.search(r"(?:\u20B9|Rs\.?)\s*([\d,]+\.?\d*)\s*\(Excluding\s*All\s*Taxes\)", summary_text, re.IGNORECASE)
                if m:
                    val = float(m.group(1).replace(",", ""))
                    if 0.01 < val < 100000:
                        print(f"[SHARVI] Found real unit price via summary text: {val}")
                        return val
        except Exception as e:
            print(f"[SHARVI] Summary text extraction attempt failed: {e}")

        # 2. Fallback to active price selectors (blue/active price on site)
        # We want to avoid 'del' (struck-out MRP) and find the actual amount
        try:
            # Try to get the price element itself
            price_elem = page.locator(".summary p.price, .entry-summary p.price, .product-info p.price").first
            if price_elem.count() > 0:
                # Get all text from price element
                price_text = price_elem.inner_text()
                # Check for "Excluding All Taxes" within this specific element
                m = re.search(r"(?:\u20B9|Rs\.?)\s*([\d,]+\.?\d*)", price_text)
                if m:
                    val = float(m.group(1).replace(",", ""))
                    if 0.01 < val < 100000:
                        print(f"[SHARVI] Found price via localized p.price: {val}")
                        return val

            active_price_selectors = [
                "p.price ins .woocommerce-Price-amount bdi", # Discounted active price
                "p.price .woocommerce-Price-amount:not(del *) bdi", # Regular active price
                ".product .summary .price .woocommerce-Price-amount bdi",
            ]
            
            for sel in active_price_selectors:
                loc = page.locator(sel).first
                if loc.count() > 0 and loc.is_visible(timeout=1000):
                    val = _parse_price_text(loc.inner_text())
                    if val and 0.01 < val < 100000:
                        print(f"[SHARVI] Found price via active selector: {val}")
                        return val
        except: pass

        # Broad fallback as a last resort
        price = _try_selectors(page, [
            ".product .summary .price .woocommerce-Price-amount bdi",
            ".product .entry-summary .price .woocommerce-Price-amount bdi",
            ".product .price .woocommerce-Price-amount bdi",
            ".woocommerce div.product p.price .woocommerce-Price-amount bdi",
            "form.cart ~ .price .woocommerce-Price-amount bdi",
        ])
        if price:
            print(f"[SHARVI] Found product price via generic selector: {price}")
            return price

    except Exception as e:
        print(f"[SHARVI] Error extracting price: {e}")
    return None

def clean_price(price_str):
    if not price_str: return 0
    cleaned = re.sub(r'[\u20B9Rs$\s]', '', price_str)
    cleaned = re.sub(r',', '', cleaned)
    try:
        return float(cleaned) if cleaned else 0
    except: return 0

def extract_ktron_price(page):
    """Extract product price from Ktron (WooCommerce). Uses .product-scoped selectors."""
    try:
        # Scope to .product to avoid matching cart widget in header/sidebar
        price = _try_selectors(page, [
            ".product .summary .price .woocommerce-Price-amount bdi",
            ".product .entry-summary .price .woocommerce-Price-amount bdi",
            ".product .price .woocommerce-Price-amount bdi",
            ".woocommerce div.product p.price .woocommerce-Price-amount bdi",
        ])
        if price:
            print(f"[KTRON] Found product price via selector: {price}")
            return price

        # Fallback: try pricing table rows (k=kilo multiplier support)
        rows = page.locator("table tr").all()
        for row in rows:
            text = row.inner_text()
            if "\u20b9" in text:
                val = _parse_price_text(text)
                if val and val > 0:
                    if re.search(r'k\b', text, re.IGNORECASE): val *= 1000
                    return val
    except Exception as e:
        print(f"[KTRON] Error extracting price: {e}")
    return None

def extract_evelta_price(page):
    """Specific extractor for Evelta to avoid picking up SKU/MPN numbers."""
    try:
        # Prioritize tax-exclusive price from product view area
        price = _try_selectors(page, [
            ".productView-price .price--withoutTax",
            "[data-product-price-without-tax]",
            ".productView-price .price--main",
            ".price-section--withoutTax .price"
        ])
        if price:
            print(f"[EVELTA] Found product price via selector: {price}")
            return price
    except Exception as e:
        print(f"[EVELTA] Error extracting price: {e}")
    return None

def extract_clean_price(page, site_name):
    """Fallback price extractor for Evelta and generic sites."""
    try:
        # Site-specific priority selectors — always scoped to product area
        site_selectors = {
            "EVELTA":  ["[data-product-price-without-tax]", ".price--withoutTax", ".productView-price--withoutTax", ".price--main"],
            "ELEVTA": ["[data-product-price-without-tax]", ".price--withoutTax", ".productView-price--withoutTax", ".price--main"],
            "ROBU":   [
                ".summary .price .woocommerce-Price-amount",
                ".summary .price",
                ".price .woocommerce-Price-amount",
                ".woocommerce-Price-amount",
                ".product .summary .price .woocommerce-Price-amount bdi",
                ".product .summary .price",
                ".product .price .woocommerce-Price-amount bdi",
                ".woocommerce div.product p.price .woocommerce-Price-amount bdi",
                ".woocommerce div.product p.price",
                ".summary p.price",
                "#content p.price bdi",
                "#content p.price",
                "#main p.price bdi",
                "#main p.price",
            ],
        }
        selectors = site_selectors.get(site_name.upper(), [
            ".product .summary .price .woocommerce-Price-amount bdi",
            ".product .entry-summary .price .woocommerce-Price-amount bdi",
            ".product .price .woocommerce-Price-amount bdi",
            ".woocommerce div.product p.price .woocommerce-Price-amount bdi",
            ".price--withoutTax",
            "[data-product-price-without-tax]",
        ])
        price = _try_selectors(page, selectors)
        if price:
            print(f"[{site_name}] Found clean price via selector: {price}")
            return price

        # Last resort: Evelta uses BigCommerce, check specific attributes
        if site_name.upper() in ("EVELTA", "ELEVTA"):
            try:
                attr_val = page.locator("[data-product-price-without-tax]").first.get_attribute("content")
                if attr_val:
                    val = float(attr_val)
                    if val > 0: return val
            except: pass

        # Final last resort: Search body text for "\u20B9X.XX (Incl. GST)" or similar
        try:
            body_text = page.locator("body").inner_text()
            # Match "\u20B9 0.78 (Incl. GST)" or "\u20B90.78" or "Rs. 0.78"
            # Stricter regex for Robu to match "(Incl. GST)" specifically
            if site_name.upper() == "ROBU":
                m = re.search(r"(?:\u20B9|Rs\.?)\s*([\d,]+\.?\d*)\s*\(Incl\.\s*GST\)", body_text)
                if m:
                    val = float(m.group(1).replace(",", ""))
                    print(f"[ROBU] Found normal price with (Incl. GST): {val}")
                    return val
            
            m = re.search(r"(?:\u20B9|Rs\.?)\s*([\d,]+\.?\d*)", body_text)
            if m:
                val = float(m.group(1).replace(",", ""))
                if 0.01 < val < 1000000: 
                    print(f"[{site_name}] Found price in body text: {val}")
                    return val
        except: pass

        # KTRON-style fallback for ROBU (Search all table rows)
        if site_name.upper() == "ROBU":
            try:
                rows = page.locator("table tr").all()
                for row in rows:
                    text = row.inner_text()
                    if "\u20b9" in text:
                        val = _parse_price_text(text)
                        if val and val > 0:
                            print(f"[ROBU] Found price via table search: {val}")
                            return val
            except: pass

    except Exception as e:
        print(f"[{site_name}] Error in extract_clean_price: {e}")
    return None

def extract_pricing_tiers(page, site_name):
    """Extract ALL pricing tiers from table (qty ranges and prices)"""
    tiers = []
    rows_found = False
    try:
        # For Robu, scroll down slightly as tables are sometimes lazy-loaded or only visible on scroll
        if site_name.upper() == "ROBU":
            page.evaluate("window.scrollTo(0, 600)")
            time.sleep(1)

        # Increase timeout and add more Robu-specific selectors
        # Wait for either the table or the specific Robu bulk-price container
        try:
            page.wait_for_selector(".productView-info-bulkPricing, .bulk-price-table, .wc-b2b-table, table, .tiered-pricing-table, .pro_bulk_pricing_table, .bulk-pricing", timeout=5000)
            if site_name.upper() == "ROBU":
                # Special check for Robu's MOQ text which often appears first
                try:
                    page.wait_for_selector("text='MOQ Discount'", timeout=2000)
                except: pass
        except:
            pass
            
        # Get rows from standard tables OR Evelta's div-based table OR Robu's B2B table
        # Scoped to product details area where possible to avoid matching cart widgets
        rows = page.locator(".productView-info-bulkPricing .productView-table-row, .productView-details .productView-table-row, .productView-options .productView-table-row, .product-summary table tr, .summary table tr, table.pro_bulk_pricing_table tr, .wc-b2b-table tr, table.tiered-pricing-table tr, .bulk-pricing table tr").all()
        
        if not rows:
            # Fallback to more general table locators
            rows = page.locator(".productView-table-row, .productView-info-bulkPricing table tr, table.pro_bulk_pricing_table tr, .wc-b2b-table tr, table.tiered-pricing-table tr, table tr").all()
        
        # ROBU SPECIFIC: Only look at rows within or starting the MOQ table
        if site_name.upper() == "ROBU":
            rows_found = any(any(k in r.inner_text().upper() for k in ["MOQ DISCOUNT", "QUANTITY RANGE", "PRICE / QTY", "\u20B9", "RS"]) for r in rows)
        elif site_name.upper() == "SHARVI":
            # For Sharvi, check if rows contain both quantity indicators and currency
            # This helps distinguish between spec tables and bulk pricing tables
            rows_found = any(re.search(r"(\d+)\s*-\s*(\d+).*?(?:\u20B9|Rs\.?)", r.inner_text()) for r in rows)
        else:
            rows_found = len(rows) > 0
        
        # BRUTE FORCE FALLBACK: If locator fails, try to get all text via JS
        if not rows:
            print(f"[{site_name}] Standard locator failed, trying JS evaluation...")
            table_data = page.evaluate("""() => {
                const results = [];
                // Standard tables and B2B tables
                document.querySelectorAll('table tr, .wc-b2b-table tr, .productView-table-row, .tiered-pricing-table tr').forEach(tr => results.push(tr.innerText));
                return results;
            }""")
            if table_data:
                rows_found = True
                print(f"[{site_name}] Found {len(table_data)} rows via JS.")
                for text in table_data:
                    # Normalize text
                    text = re.sub(r'\s+', ' ', text.strip())
                    if not text: continue
                    
                    # Exclude metadata
                    if any(k in text.upper() for k in ["SKU:", "MPN:", "PART NUMBER", "FULL REEL"]): continue

                    numbers = re.findall(r"([\d,]+\.?\d*)", text.replace(',', ''))
                    price_m = re.search(r"(?:\u20B9|Rs\.?)\s*([\d,]+\.?\d*)", text)
                    if price_m and len(numbers) >= 2:
                        price = float(price_m.group(1).replace(',', ''))
                        qty_val = None
                        for n in numbers:
                            if float(n) != price:
                                qty_val = int(float(n)); break
                        if qty_val is not None:
                            max_q = float('inf')
                            range_m = re.search(fr"{qty_val}\s*-\s*(\d+)", text)
                            if range_m: max_q = int(range_m.group(1))
                            tiers.append((qty_val, max_q, price))

        print(f"[{site_name}] Analyzing {len(rows)} potential rows for tiers...")
        
        in_moq_table = False
        for row in rows:
            try:
                text = row.inner_text().strip()
                if not text: continue
                # Normalize spaces
                text = re.sub(r'\s+', ' ', text)
                
                # ROBU SPECIFIC: Only look at rows within or starting the MOQ table
                if site_name.upper() == "ROBU":
                    if any(k in text.upper() for k in ["MOQ DISCOUNT", "QUANTITY RANGE", "PRICE / QTY"]):
                        in_moq_table = True
                        print(f"[ROBU] Found MOQ table start: {text}")
                        continue
                    
                    # If we haven't seen the table start yet, skip this row
                    # UNLESS it looks exactly like a tier (e.g. "1-9 \u20B9 4.53")
                    if not in_moq_table:
                        if not re.search(r"\d+.*?(?:\u20B9|Rs\.?)", text):
                            continue
                    
                    # If we are in or after the table header, exclude spec rows
                    if any(k in text for k in [":", "Manufacturer", "Series", "Weight", "Dimensions", "Temperature"]):
                        # If we hit a spec row after the table, the table has ended
                        if in_moq_table: in_moq_table = False
                        continue

                print(f"[{site_name}] Checking row: {text}")
                
                # CRITICAL: Exclude SKU, MPN, and Part Number rows from price/tier analysis
                if any(k in text.upper() for k in ["SKU:", "MPN:", "PART NUMBER", "FULL REEL"]):
                    continue
                
                # Pattern 1: SHARVI (50 - 200 \u20B90.81)
                sharvi_m = re.search(r"(\d+)\s*-\s*(\d+).*?(?:\u20B9|Rs\.?)\s*(\d+\.?\d*)", text)
                if sharvi_m:
                    tiers.append((int(sharvi_m.group(1)), int(sharvi_m.group(2)), float(sharvi_m.group(3))))
                    continue
                    
                # Pattern 2: Generic (1-9, 10-99, 10+, 5000 or above)
                # Find all numbers in the row
                numbers = re.findall(r"([\d,]+\.?\d*)", text.replace(',', ''))
                # Find price with currency
                price_m = re.search(r"(?:\u20B9|Rs\.?)\s*([\d,]+\.?\d*)", text)
                
                price = None
                if price_m:
                    price = float(price_m.group(1).replace(',', ''))
                elif len(numbers) >= 2 and site_name.upper() != "ROBU":
                    # Fallback for rows without currency (STRICTLY DISALLOW FOR ROBU)
                    last_num = float(numbers[-1])
                    if last_num < 1000: price = last_num

                if price is not None:
                    # The first number that is NOT the price is likely the quantity
                    qty_val = None
                    for n in numbers:
                        if float(n) != price:
                            qty_val = int(float(n))
                            break
                    
                    if qty_val is not None:
                        max_q = float('inf')
                        # Check for range (e.g., "10 - 99" or "10 99")
                        for n in numbers:
                            if float(n) != price and int(float(n)) > qty_val:
                                max_q = int(float(n)); break
                        
                        tiers.append((qty_val, max_q, price))
            except: continue
                    
        # Sort and deduplicate
        if tiers:
            tiers.sort(key=lambda x: x[0])
            # Clean up overlaps
            for i in range(len(tiers) - 1):
                if tiers[i][1] == float('inf'):
                    tiers[i] = (tiers[i][0], tiers[i+1][0] - 1, tiers[i][2])
            
            print(f"[{site_name}] Extracted tiers: {tiers}")
            return tiers, rows_found
    except Exception as e:
        print(f"[{site_name}] Tier extraction error: {e}")
    return [], rows_found

def get_price_from_tiers(tiers, qty, site_name=""):
    if not tiers: return None
    # Sort to be safe
    tiers.sort(key=lambda x: x[0])
    for min_q, max_q, price in tiers:
        if min_q <= qty <= max_q:
            print(f"[{site_name}] Success: Qty {qty} falls in tier {min_q}-{max_q} (\u20B9{price})")
            return price
    # Fallback: if quantity is higher than the last tier's min_qty
    if qty >= tiers[-1][0]:
        return tiers[-1][2]
    return tiers[0][2]

# Cart page URLs per vendor (used by frontend "View Cart" button)
VENDOR_CART_URLS = {
    "ROBU":      "https://robu.in/cart/",
    "EVELTA":    "https://evelta.com/cart.php",
    "ELEVTA":    "https://evelta.com/cart.php",
    "KTRON":     "https://ktron.in/cart/",
    "SHARVI":    "https://sharvielectronics.com/cart/",
    "ELEMENT14": "",
}

# ---------------------------------------------------------------------------
# Startup: login to all WooCommerce vendors once and save session JSON files
# ---------------------------------------------------------------------------
def _initialize_sessions(active_vendors: list = None):
    """Login only to the selected vendors and cache session cookies."""
    all_vendor_configs = {
        "EVELTA":  {
            "email":     os.getenv("EVELTA_EMAIL", ""),
            "password":  os.getenv("EVELTA_PASSWORD", ""),
            "login_url": "https://evelta.com/login.php",   # BigCommerce, not WooCommerce
            "state":     SESSION_DIR / "evelta_state.json",
        },
        "KTRON":   {
            "email":     os.getenv("KTRON_EMAIL", ""),
            "password":  os.getenv("KTRON_PASSWORD", ""),
            "login_url": "https://ktron.in/my-account/",
            "state":     SESSION_DIR / "ktron_state.json",
        },
        "SHARVI":  {
            "email":     os.getenv("SHARVI_EMAIL", ""),
            "password":  os.getenv("SHARVI_PASSWORD", ""),
            "login_url": "https://sharvielectronics.com/my-account/",
            "state":     SESSION_DIR / "sharvi_state.json",
        },
        "ROBU":    {
            "email":     os.getenv("ROBU_EMAIL", ""),
            "password":  os.getenv("ROBU_PASSWORD", ""),
            "login_url": "https://robu.in/my-account/",
            "state":     SESSION_DIR / "robu_state.json",
        },
    }

    # Filter to only the vendors the user actually selected
    if active_vendors:
        # Normalize: ELEVTA alias also maps to evelta_state.json
        active_set = {v.upper() for v in active_vendors}
        if "ELEVTA" in active_set:
            active_set.add("EVELTA")
        
        # JIT OPTIMIZATION: Skip Evelta during initial global login 
        # (It will login JIT during add-to-cart to prevent timeout)
        if "EVELTA" in active_set:
            print("[EVELTA] ⏳ Delaying login until Add-to-Cart (JIT mode)")
            active_set.remove("EVELTA")

        vendor_configs = {k: v for k, v in all_vendor_configs.items() if k in active_set}
    else:
        # Default behavior: JIT for Evelta
        vendor_configs = {k: v for k, v in all_vendor_configs.items() if k != "EVELTA"}

    if not vendor_configs:
        print("\n⏭️ No vendor sessions needed — skipping login step\n")
        return

    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    selected_names = ", ".join(vendor_configs.keys())
    print(f"\n[*] Initializing sessions for: {selected_names}")

    def _login_one(vendor, cfg):
        if not cfg["email"] or not cfg["password"]:
            print(f"[{vendor}] No credentials — skipping login")
            return
        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=HEADLESS,
                    args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
                )
                context = browser.new_context(
                    viewport={"width": 1280, "height": 800},
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/122.0.0.0 Safari/537.36"
                    )
                )
                page = context.new_page()
                Stealth().apply_stealth_sync(page)
                cart_auto = CartAutomation()
                cart_auto.login_and_save_state(
                    page, cfg["email"], cfg["password"],
                    cfg["login_url"], cfg["state"], vendor
                )
                browser.close()
        except Exception as e:
            print(f"[{vendor}] Login thread failed: {e}")

    # Login to all vendors in parallel
    with ThreadPoolExecutor(max_workers=len(vendor_configs)) as ex:
        futs = [ex.submit(_login_one, v, c) for v, c in vendor_configs.items()]
        for f in futs: f.result()

    print("[*] All vendor sessions ready\n")


# ---------------------------------------------------------------------------
# Post-selection cart: open a saved-session browser and add to cart
# ---------------------------------------------------------------------------
def _add_to_cart_for_vendor(vendor: str, product_url: str, quantity: int, item_name: str = "") -> dict:
    """Load vendor's saved session and add the product to cart."""
    state_path = SESSION_DIR / f"{vendor.lower()}_state.json"
    # For Evelta, we allow proceeding without a session file (JIT login)
    if not state_path.exists() and vendor.upper() in ("EVELTA", "ELEVTA"):
        print(f"[{vendor}] No session file — cannot add to cart")
        return {"success": False, "message": "No session file"}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=HEADLESS,
                args=["--disable-blink-features=AutomationControlled"]
            )
            
            ctx_kwargs = {
                "viewport": {"width": 1280, "height": 800},
                "user_agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/122.0.0.0 Safari/537.36"
                )
            }
            if state_path.exists():
                ctx_kwargs["storage_state"] = str(state_path)
            else:
                print(f"[{vendor}] No session file — starting as guest (will login JIT if needed)")

            context = browser.new_context(**ctx_kwargs)
            page = context.new_page()
            Stealth().apply_stealth_sync(page)
            cart = CartAutomation()
            # Evelta = BigCommerce platform; Ktron/Sharvi = WooCommerce
            if vendor.upper() in ("EVELTA", "ELEVTA"):
                res = cart.add_to_cart_bigcommerce(page, product_url, quantity, vendor, item_name)
            else:
                res = cart.add_to_cart_woocommerce(page, product_url, quantity, vendor, item_name)
            browser.close()
            return res
    except Exception as e:
        print(f"[{vendor}] ⚠️ Cart error: {e}")
        return {"success": False, "message": f"Cart error: {e}"}


# sync_playwright is NOT thread-safe – each thread must own its playwright.
# This module-level function is what ThreadPoolExecutor workers call.
# ---------------------------------------------------------------------------
def _run_vendor_in_thread(
    vendor: str,
    base_url: str,
    search_query: str,
    use_sku: bool,
    quantity: int,
    comp: str = "",
) -> dict:
    """Run one vendor search inside its own isolated Playwright process."""
    try:
        # Load saved session cookies if available (logged-in searches)
        state_path = SESSION_DIR / f"{vendor.lower()}_state.json"
        state_arg  = str(state_path) if state_path.exists() else None

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=HEADLESS,
                args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
            )
            ctx_kwargs = dict(
                viewport={"width": 1280, "height": 800},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/122.0.0.0 Safari/537.36"
                )
            )
            # Anonymous search — no login state loaded here
            context = browser.new_context(**ctx_kwargs)
            page = context.new_page()
            Stealth().apply_stealth_sync(page)
            
            # Dismiss popups (like Ktron's Allow/Cancel) during search phase
            cart = CartAutomation()
            cart._dismiss_popups(page)
            
            processor = BOMProcessor()

            if vendor == "ELEMENT14":
                if not use_sku or not search_query:
                    return None
                result = processor.search_element14(page, comp, search_query, quantity)
            elif vendor == "ROBU":
                result = processor.search_robu(page, search_query, quantity)
            else:
                result = processor.generic_site_handler(
                    page, vendor, base_url, search_query,
                    use_sku=use_sku, quantity=quantity
                )
            browser.close()
            return result
    except Exception as e:
        print(f"[{vendor}] ⚠️ Thread error: {e}")
        return None


class BOMProcessor:
    def __init__(self):
        self.vendors = ["EVELTA", "ROBU", "KTRON", "SHARVI", "ELEMENT14"]

    def find_header_and_map(self, df_head: pd.DataFrame) -> Dict[str, Any]:
        mapping = {"component": None, "quantity": None, "footprint": None, "vendor_codes": {}}
        for col in df_head.columns:
            col_name = str(col).lower().strip()
            if any(k in col_name for k in ["component", "item", "name", "part", "resistor"]):
                if not mapping["component"]: mapping["component"] = col
            elif any(k in col_name for k in ["qty", "quantity", "count"]):
                if not mapping["quantity"]: mapping["quantity"] = col
            elif any(k in col_name for k in ["footprint", "package", "size"]):
                if not mapping["footprint"]: mapping["footprint"] = col
            for v in ["EVELTA", "ELEVTA", "ROBU", "KTRON", "SHARVI", "ELEMENT14"]:
                if v.lower() in col_name:
                    mapping["vendor_codes"][v] = col
                    if v in ["EVELTA", "ELEVTA"]:
                        mapping["vendor_codes"]["EVELTA"] = col
                        mapping["vendor_codes"]["ELEVTA"] = col
        return mapping

    def safe_search(self, page, url, product):
        print(f"Opening: {url}")
        try:
            page.goto(url, timeout=60000, wait_until="domcontentloaded")
            time.sleep(random.uniform(2, 4))
            # Dismiss any popups that appear on the homepage/search page
            CartAutomation()._dismiss_popups(page)
            search_selectors = [
                "input.search-input", "input#search-input", "input[placeholder*='Search']", 
                "input[name='s']", ".aws-search-field", ".dgwt-wcas-search-input", 
                "input[type='search']", "input.form-input", "input.search-field"
            ]
            search_box = None
            for sel in search_selectors:
                try:
                    loc = page.locator(sel)
                    if loc.count() > 0:
                        # Try to find a visible one
                        for i in range(loc.count()):
                            if loc.nth(i).is_visible():
                                search_box = loc.nth(i)
                                break
                        if search_box: break
                except: continue
            
            # If still not found, check for a search icon to click first
            if not search_box:
                try:
                    search_trigger = page.locator(".search-opener, .search-icon, button[aria-label*='Search']").first
                    if search_trigger.count() > 0 and search_trigger.is_visible():
                        search_trigger.click()
                        time.sleep(1)
                        # Re-check selectors
                        for sel in search_selectors:
                            loc = page.locator(sel).first
                            if loc.count() > 0 and loc.is_visible():
                                search_box = loc
                                break
                except: pass

            if not search_box: return False
            search_box.click()
            search_box.fill("")
            search_box.type(product, delay=random.randint(50, 150))
            time.sleep(2.5)
            dropdown_selectors = [".dgwt-wcas-suggestions-wrp a[href*='/product/']", ".aws-search-result a[href*='/product/']", ".live-search-results a[href*='/product/']", ".autocomplete-suggestions a[href*='/product/']", "[class*='suggestion'] a[href*='/product/']", "[class*='dropdown'] a[href*='/product/']", "[class*='result'] a[href*='/product/']"]
            dropdown_href = None
            for sel in dropdown_selectors:
                try:
                    loc = page.locator(sel)
                    if loc.count() > 0 and loc.first.is_visible(timeout=1000):
                        dropdown_href = loc.first.get_attribute("href")
                        break
                except: continue
            if dropdown_href:
                page.goto(dropdown_href, timeout=60000, wait_until="domcontentloaded")
                page.wait_for_timeout(3000)
                page.wait_for_load_state("networkidle", timeout=60000)
                return True
            page.keyboard.press("Enter")
            page.wait_for_timeout(4000) 
            page.wait_for_load_state("networkidle", timeout=60000)
            return True
        except: return False

    def generic_site_handler(self, page, site_name, base_url, product, use_sku=False, quantity=1, validation_sku=None):
        search_type = "SKU" if use_sku else "Name"
        print(f"[{site_name}] 🔍 Scouting by {search_type}: {product}")
        if not self.safe_search(page, base_url, product): return None
        try:
            vendor_key = site_name.upper().strip()
            if vendor_key in ["EVELTA", "ELEVTA"]:
                if "/search-results-page" in page.url or "search" in page.url or "q=" in page.url:
                    link_selectors = ["a[href*='/product/']", ".snize-view-link", ".snize-title", ".card-title a", ".product-item-name a", ".product-title a", ".productCard-title a"]
                    product_links = page.locator(", ".join(link_selectors))
                    if product_links.count() > 0:
                        target_link = None
                        if use_sku and product.strip():
                            for i in range(product_links.count()):
                                try:
                                    link_text = product_links.nth(i).inner_text().lower()
                                    if product.lower() in link_text:
                                        target_link = product_links.nth(i); break
                                except: continue
                        if not target_link: target_link = product_links.first
                        target_link.click(force=True)
                        page.wait_for_load_state("networkidle", timeout=60000)
                        time.sleep(3)
                pass
            elif vendor_key in ["KTRON", "ROBU"]:
                if "?s=" in page.url:
                    links = page.locator("a[href*='/product/']")
                    if links.count() > 0:
                        links.first.click(force=True)
                        page.wait_for_load_state("networkidle", timeout=60000)
            elif vendor_key == "SHARVI":
                if "product" not in page.url:
                    links = page.locator("a[href*='/product/']")
                    if links.count() > 0:
                        links.first.click(force=True)
                        page.wait_for_load_state("networkidle", timeout=60000)

            is_out_of_stock = False
            summary_text = ""
            try:
                summary_text = page.locator(".entry-summary, .productView-details, .product-info-main, .summary").inner_text().lower()
            except:
                summary_text = page.content().lower()[:5000]
            
            stock_keywords = ["out of stock", "currently unavailable", "sold out"]
            if any(k in summary_text for k in stock_keywords):
                is_out_of_stock = True
            
            insufficient_stock_info = None
            try:
                body_text = page.evaluate("() => document.body.innerText")
                m = re.search(r"only\s*(\d+)\s*(?:units?|items?)?\s*(?:are\s*)?available", body_text, re.IGNORECASE)
                if m:
                    available = int(m.group(1))
                    if available < quantity:
                        insufficient_stock_info = {"available": available, "message": f"Only {available} units available."}
            except: pass

            tiers, rows_found = extract_pricing_tiers(page, site_name)
            price = None
            
            # For Sharvi, we prefer the "Excluding All Taxes" price if quantity is 1 
            # OR if tiers are missing/not applicable for the requested quantity.
            if site_name.upper() == "SHARVI":
                page_price = self.extract_price_from_page(page, site_name, quantity)
                if tiers:
                    tier_price = get_price_from_tiers(tiers, quantity, site_name)
                    # If quantity is 1, always prefer page price
                    # Otherwise, use tier price if found, else fallback to page price
                    if quantity == 1:
                        price = page_price or tier_price
                    else:
                        price = tier_price or page_price
                else:
                    price = page_price
            else:
                if tiers:
                    price = get_price_from_tiers(tiers, quantity, site_name)
                elif not rows_found or site_name.upper() == "ROBU":
                    # For Robu, always try normal price if tiers are missing
                    price = self.extract_price_from_page(page, site_name, quantity)
                else:
                    print(f"[{site_name}] ⚠️ Tier rows found but could not be parsed. Skipping normal price as per strict tier rule.")

            # --- PROACTIVE MOQ SCRAPING ---
            moq_detected = 1
            try:
                # Scrape MOQ from summary or body, but avoid "Reel" or "Pack of" if they refer to full rolls
                lines = summary_text.split('\n')
                moq_regex = r"(?:Minimum\s*(?:Order\s*)?quantity|Minimum\s*Order\s*Qty|MOQ|Pack\s*of)\s*[:\-]?\s*(\d+)"
                for line in lines:
                    if "reel" in line.lower() or "full pack" in line.lower(): continue
                    m_moq = re.search(moq_regex, line, re.IGNORECASE)
                    if m_moq:
                        moq_detected = int(m_moq.group(1))
                        print(f"[{site_name}] 🔍 Proactively scraped MOQ: {moq_detected}")
                        break
                
                # If not found in summary, check body but be even more careful
                if moq_detected == 1:
                    body_text = page.evaluate("() => document.body.innerText")
                    for line in body_text.split('\n')[:100]: # Check first 100 lines
                        if "reel" in line.lower() or "full pack" in line.lower(): continue
                        m_moq = re.search(moq_regex, line, re.IGNORECASE)
                        if m_moq:
                            moq_detected = int(m_moq.group(1))
                            print(f"[{site_name}] 🔍 Proactively scraped MOQ (body): {moq_detected}")
                            break
            except: pass

            if insufficient_stock_info:
                return {"site": site_name, "price": price, "url": page.url, "out_of_stock": True, "error": "Insufficient Stock", "available": insufficient_stock_info["available"], "message": insufficient_stock_info["message"], "moq": moq_detected}

            if price is not None or is_out_of_stock:
                return {"site": site_name, "price": price, "url": page.url, "out_of_stock": is_out_of_stock, "moq": moq_detected}
            return None
        except: return None

    def extract_price_from_page(self, page, site_name, quantity=1):
        if site_name == "KTRON": return extract_ktron_price(page)
        if site_name == "SHARVI": return extract_sharvi_price(page)
        if site_name in ["EVELTA", "ELEVTA"]: return extract_evelta_price(page)
        return extract_clean_price(page, site_name)

    def search_robu(self, page, product, quantity=1):
        """Use the specialized RobuScraper for better accuracy on Robu.in"""
        try:
            scraper = RobuScraper()
            # 1. Search for the product
            search_res = scraper.search_product(page, product)
            
            # Dismiss any popups that might have appeared after searching
            CartAutomation()._dismiss_popups(page)
            
            if search_res.get("found") and search_res.get("product_url"):
                # 2. Extract price (handling tiers and stock)
                price_res = scraper.extract_price(page, search_res["product_url"], quantity, product)
                
                if "price" in price_res and price_res["price"] != "Not Available":
                    return {
                        "site": "ROBU",
                        "price": price_res["price"],
                        "url": search_res["product_url"],
                        "out_of_stock": price_res.get("out_of_stock", False),
                        "error": price_res.get("error"),
                        "available": price_res.get("available"),
                        "message": price_res.get("message")
                    }
            
            # Fallback to generic handler if specialized scraper fails
            return self.generic_site_handler(page, "ROBU", "https://robu.in", product, use_sku=True, quantity=quantity)
        except Exception as e:
            print(f"[ROBU] Error in search_robu: {e}")
            return None

    def search_element14(self, page, component, sku, quantity=1):
        code = str(sku).strip()
        url = f"https://in.element14.com/dp/{code}"
        try:
            page.goto("https://in.element14.com", timeout=60000)
            page.wait_for_timeout(3000)
            page.goto(url, timeout=60000)
            price = self.extract_price_from_page(page, "ELEMENT14", quantity)
            if price: return {"site": "ELEMENT14", "price": price, "url": url}
        except: pass
        return None

    def _process_vendor_cart_sequentially(self, vendor: str, items: List[Dict]):
        """Sequential login, cart clearing, and addition for a single vendor."""
        try:
            print(f"\n[*] === Starting Sequential Cart Flow for {vendor} ({len(items)} items) ===")
            email = os.getenv(f"{vendor.upper()}_EMAIL")
            password = os.getenv(f"{vendor.upper()}_PASSWORD")
            login_url_map = {
                "ROBU":   "https://robu.in/my-account/",
                "KTRON":  "https://www.ktron.in/my-account/",
                "SHARVI": "https://sharvielectronics.com/my-account/",
                "EVELTA": "https://evelta.com/login.php"
            }
            login_url = login_url_map.get(vendor)
            if not email or not password or not login_url:
                print(f"[{vendor}] ⚠️ Missing credentials or login URL — skipping cart phase")
                return

            with sync_playwright() as p:
                browser = p.chromium.launch(headless=HEADLESS, args=["--disable-blink-features=AutomationControlled", "--no-sandbox"])
                context = browser.new_context(viewport={"width": 1280, "height": 800})
                page = context.new_page()
                Stealth().apply_stealth_sync(page)
                cart = CartAutomation()

                # 1. Login
                print(f"[{vendor}] Logging in...")
                state_path = SESSION_DIR / f"{vendor.lower()}_state.json"
                login_success = cart.login_and_save_state(page, email, password, login_url, state_path, vendor)
                if not login_success:
                    print(f"[{vendor}] ❌ Login failed — skipping items")
                    browser.close()
                    return

                # 2. Add Items Sequentially (Cart clearing removed as per request)

                # 3. Add Items Sequentially
                for item in items:
                    comp = item["component"]
                    qty = item["qty"]
                    product_url = item["links"].get(vendor) or item.get("best_url")
                    if not product_url: continue

                    # --- PRE-EXTRACT UNIT PRICE FOR CART VERIFICATION ---
                    unit_price = 0
                    if "original_item" in item:
                        orig = item["original_item"]
                        for alloc in orig.get("allocations", []):
                            if alloc["vendor"] == vendor:
                                unit_price = alloc["unit_price"]
                                break

                    print(f"[{vendor}] Adding item: {comp} (Qty: {qty}, Unit Price: ₹{unit_price})")
                    if vendor == "ROBU":
                        res = cart.add_to_cart_robu(page, product_url, qty, comp, unit_price=unit_price)
                    elif vendor == "EVELTA":
                        res = cart.add_to_cart_bigcommerce(page, product_url, qty, vendor, comp, unit_price=unit_price)
                    else:
                        res = cart.add_to_cart_woocommerce(page, product_url, qty, vendor, comp, unit_price=unit_price)

                    # 4. Handle results (Stock warnings etc.)
                    added_qty = qty
                    if res and res.get("added_qty") is not None:
                        added_qty = res["added_qty"]
                    
                    if "original_item" in item:
                        orig = item["original_item"]
                        # Initialize remaining_qty if this is the first vendor processing for this item
                        if "remaining_qty" not in orig:
                            orig["remaining_qty"] = orig["qty"]
                        
                        # --- VENDOR DECISION ENGINE (STATE-BASED) ---
                        # (unit_price already extracted above)
                        
                        target_qty = item["qty"] 
                        original_qty = orig["remaining_qty"]
                        
                        if not res or not res.get("success"):
                            status = "INVALID"
                            reason = "Cart addition failed"
                        else:
                            actual_total = added_qty * unit_price
                            if vendor == "ROBU" and actual_total < 10:
                                status = "INVALID"
                                reason = f"Actual Total ₹{actual_total:.2f} < ₹10"
                            elif added_qty >= target_qty:
                                status = "SUCCESS"
                                reason = "Full target satisfied"
                            elif added_qty >= original_qty:
                                status = "SUCCESS"
                                reason = f"Original requirement satisfied ({added_qty}/{original_qty})"
                            elif added_qty > 0:
                                status = "PARTIAL"
                                reason = f"Partial fulfillment: {added_qty}/{original_qty}"
                            else:
                                status = "INVALID"
                                reason = "Zero quantity added"

                        # --- EXECUTE ACTION BASED ON STATUS ---
                        if status in ["SUCCESS", "PARTIAL"]:
                            print(f"[{vendor}] {'✅' if status == 'SUCCESS' else '⚠️'} {status}: {reason}")
                            orig["remaining_qty"] = max(0, orig["remaining_qty"] - added_qty)
                            orig["unfulfilled"] = orig["remaining_qty"]
                            for alloc in orig.get("allocations", []):
                                if alloc["vendor"] == vendor:
                                    alloc["qty"] = added_qty
                                    alloc["total"] = added_qty * unit_price
                                    break
                        elif status == "INVALID":
                            print(f"[{vendor}] ❌ INVALID: {reason} → Removing and Re-allocating")
                            if res and res.get("success"):
                                # Ensure we remove the item from cart if it was actually added but failed ₹10 rule
                                cart.remove_item_from_cart(page, comp, vendor, quantity=added_qty, unit_price=unit_price)
                            
                            for alloc in orig.get("allocations", []):
                                if alloc["vendor"] == vendor:
                                    alloc["qty"] = 0
                                    alloc["total"] = 0
                                    break
                            # Note: orig["remaining_qty"] remains unchanged, allowing re-allocation

                browser.close()
                print(f"[{vendor}] === Sequential Cart Flow Complete ===")
        except Exception as e:
            print(f"[{vendor}] ❌ Fatal error in sequential cart flow: {e}")

    def process_bom(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> Dict[str, Any]:
        vendor_urls = {"ROBU": "https://robu.in", "EVELTA": "https://evelta.com", "ELEVTA": "https://evelta.com", "KTRON": "https://www.ktron.in", "SHARVI": "https://sharvielectronics.com", "ELEMENT14": "https://in.element14.com"}
        selected_vendors = mapping.get("vendors", list(vendor_urls.keys()))
        PARALLEL_VENDORS = {"ROBU", "EVELTA", "ELEVTA", "KTRON", "SHARVI", "ELEMENT14"}
        parallel_vendors = [v for v in selected_vendors if v in PARALLEL_VENDORS]
        processed_items = []
        vendor_totals = {v: 0 for v in selected_vendors}
        optimized_total = 0
        # REMOVED: _initialize_sessions(parallel_vendors) - Now part of sequential Phase 2
        
        try:
            for _, row in df.iterrows():
                comp = str(row.get(mapping["component"], "")).strip()
                qty = int(row.get(mapping["quantity"], 1))
                if not comp or qty <= 0: continue
                item_data = {"component": comp, "qty": qty}
                
                def _vendor_query(vendor):
                    col = mapping["vendor_codes"].get(vendor)
                    code = str(row.get(col, "")) if col else ""
                    if code and code.lower() not in ["nan", "none", ""]: return code, True
                    return None, False

                print(f"\n⚡ [{comp}] Launching parallel vendor searches...")
                with ThreadPoolExecutor(max_workers=max(1, len(parallel_vendors))) as executor:
                    futures = {}
                    for vendor in parallel_vendors:
                        sq, use_sku = _vendor_query(vendor)
                        if not use_sku:
                            print(f"[{vendor}] ⏭️ No SKU ID given — skipping search")
                            item_data[vendor] = "No SKU ID given"
                            continue
                        print(f"[{vendor}] 🔍 Scouting for: {sq} (Using SKU: {use_sku})")
                        futures[vendor] = executor.submit(_run_vendor_in_thread, vendor, vendor_urls.get(vendor, ""), sq, use_sku, qty, comp)
                
                item_data["links"] = {}
                item_data["available_stock"] = {} # Store for allocation logic
                for vendor, future in futures.items():
                    try:
                        res = future.result(timeout=120)
                    except Exception as e:
                        print(f"[{vendor}] ⚠️ Future timed out / errored: {e}")
                        res = None
                    
                    if res:
                        item_data["links"][vendor] = res.get("url")
                        # Store available stock if detected
                        if "available" in res:
                            item_data["available_stock"][vendor] = res["available"]
                        
                        if res.get("out_of_stock"):
                            oos_price = res.get("price")
                            error_type = res.get("error", "OOS")
                            item_data[vendor] = f"OOS:{oos_price}" if oos_price else error_type
                        else:
                            price = res.get("price")
                            item_data[vendor] = f"\u20B9{price:.2f}" if price else None
                        
                        # Store MOQ and available stock
                        if "moq" in res:
                            item_data[f"{vendor}_moq"] = res["moq"]
                        if "available" in res:
                            item_data[f"available_stock_{vendor}"] = res["available"]
                    else:
                        item_data[vendor] = None

                # 🔥 NEW ALLOCATION LOGIC (Multi-Vendor Split)
                allocations = []
                remaining_qty = qty
                vendor_options = []

                for v in selected_vendors:
                    price_str = item_data.get(v)
                    if isinstance(price_str, str) and price_str.startswith('\u20B9'):
                        try:
                            price = float(price_str.replace('\u20B9', ''))
                            available = item_data.get(f"available_stock_{v}")
                            moq = item_data.get(f"{v}_moq", 1)
                            vendor_options.append({
                                "vendor": v,
                                "price": price,
                                "available": available,
                                "moq": moq
                            })
                        except: pass

                # Sort by price (LOWEST FIRST)
                vendor_options.sort(key=lambda x: x["price"])

                # Allocation loop
                for opt in vendor_options:
                    if remaining_qty <= 0: break
                    
                    # If available is None, assume they can fulfill the whole remaining amount
                    can_take = opt["available"] if opt["available"] is not None else remaining_qty
                    take_qty = min(can_take, remaining_qty)
                    
                    # --- MOQ HANDLING ---
                    # If we decide to use this vendor, we MUST meet their MOQ.
                    # We increase the quantity to satisfy the vendor and complete our requirement.
                    if take_qty > 0 and opt["moq"] > take_qty:
                        print(f"[{opt['vendor']}] ℹ️ Increasing quantity from {take_qty} to meet MOQ {opt['moq']}")
                        take_qty = opt["moq"]

                    # Apply Robu minimum ₹10 rule
                    if opt["vendor"] == "ROBU" and opt["price"] > 0:
                        available = opt["available"] if opt["available"] is not None else remaining_qty
                        
                        # Step 1: minimum qty to reach ₹10
                        min_robu_qty = math.ceil(10.0 / opt["price"])
                        
                        # Step 2: try to increase quantity
                        required_qty = max(take_qty, min_robu_qty)
                        
                        # Step 3: check stock feasibility (Informational only, do NOT skip)
                        if available < required_qty:
                            print(f"[ROBU] ⚠️ Reported stock ({available}) < needed ({required_qty}) — trying anyway as per USER request")
                            
                        # Step 4: assign target quantity
                        take_qty = required_qty
                    
                    if take_qty > 0:
                        allocations.append({
                            "vendor": opt["vendor"],
                            "qty": take_qty,
                            "unit_price": opt["price"],
                            "total": take_qty * opt["price"]
                        })
                        # Update remaining_qty - clipped to 0 if we satisfied the whole requirement (plus some extra for MOQ)
                        remaining_qty = max(0, remaining_qty - take_qty)
                        # Update global totals
                        vendor_totals[opt["vendor"]] += take_qty * opt["price"]
                        optimized_total += take_qty * opt["price"]

                item_data["allocations"] = allocations
                if remaining_qty > 0:
                    item_data["unfulfilled"] = remaining_qty

                # Backward compatibility/Summary fields for UI
                if allocations:
                    item_data["best_vendor"] = allocations[0]["vendor"] # Primary vendor
                    item_data["best_price"] = f"\u20B9{allocations[0]['unit_price']:.2f}"
                    total_item_amt = sum(a["total"] for a in allocations)
                    item_data["total_amt"] = f"\u20B9{total_item_amt:.2f}"
                    item_data["cart_url"] = VENDOR_CART_URLS.get(allocations[0]["vendor"], "")
                else:
                    item_data["best_price"] = "-"
                    item_data["total_amt"] = "-"

                processed_items.append(item_data)
        finally:
            pass # ThreadPoolExecutor handles cleanup

        # --- PHASE 2: SEQUENTIAL CART ADDITION PER VENDOR ---
        print("\n🚀 Phase 1 complete. Starting Phase 2: Sequential Cart Addition...")
        
        # Group items by vendor allocation for sequential processing
        def _get_cart_plan(items_list):
            plan = {}
            for item in items_list:
                for alloc in item.get("allocations", []):
                    vendor = alloc["vendor"]
                    v_key = "EVELTA" if vendor == "ELEVTA" else vendor
                    if v_key not in plan: plan[v_key] = []
                    
                    plan[v_key].append({
                        "component": item["component"],
                        "qty": alloc["qty"],
                        "links": item["links"],
                        "best_url": item["links"].get(vendor),
                        "original_item": item # Keep reference to update later
                    })
            return plan

        vendor_cart_plan = _get_cart_plan(processed_items)

        # Process each vendor sequentially
        processed_vendors = set()
        for vendor in ["ROBU", "KTRON", "SHARVI", "EVELTA"]:
            if vendor in vendor_cart_plan:
                self._process_vendor_cart_sequentially(vendor, vendor_cart_plan[vendor])
                processed_vendors.add(vendor)

        # 🔥 DYNAMIC RE-ALLOCATION (Phase 3)
        # If any items have 'remaining_qty', try to add them to other vendors sequentially until fulfilled
        for item in processed_items:
            while item.get("remaining_qty", 0) > 0:
                print(f"\n[RE-ALLOCATE] '{item['component']}' still needs {item['remaining_qty']} units...")
                current_vendors = [a["vendor"] for a in item.get("allocations", [])]
                
                vendor_options = []
                for v in selected_vendors:
                    if v in current_vendors: continue # Already tried this vendor
                    
                    price_str = item.get(v)
                    if isinstance(price_str, str) and price_str.startswith('\u20B9'):
                        try:
                            price = float(price_str.replace('\u20B9', ''))
                            available = item["available_stock"].get(v)
                            vendor_options.append({"vendor": v, "price": price, "available": available})
                        except: pass
                
                if not vendor_options:
                    print(f"[RE-ALLOCATE] No more fallback vendors available for '{item['component']}'.")
                    break # Out of fallback vendors
                
                vendor_options.sort(key=lambda x: x["price"])
                
                best_opt = vendor_options[0]
                remaining = item["remaining_qty"]
                can_take = best_opt["available"] if best_opt["available"] is not None else remaining
                take_qty = min(can_take, remaining)
                
                # Apply Robu minimum ₹10 rule
                if best_opt["vendor"] == "ROBU" and best_opt["price"] > 0:
                    available = best_opt["available"] if best_opt["available"] is not None else remaining
                    
                    # Step 1: minimum qty to reach ₹10
                    min_robu_qty = math.ceil(10.0 / best_opt["price"])
                    
                    # Step 2: try to increase quantity
                    required_qty = max(take_qty, min_robu_qty)
                    
                    # Step 3: check stock feasibility
                    if available < required_qty:
                        print(f"[RE-ALLOCATE] [ROBU] ❌ Cannot meet ₹10 (need {required_qty}, have {available}) → skipping")
                        # Add a dummy allocation so current_vendors skips this next time
                        item["allocations"].append({"vendor": "ROBU", "qty": 0, "unit_price": best_opt["price"], "total": 0})
                        continue
                        
                    # Step 4: valid → assign
                    take_qty = required_qty
                
                if take_qty > 0:
                    new_alloc = {"vendor": best_opt["vendor"], "qty": take_qty, "unit_price": best_opt["price"], "total": take_qty * best_opt["price"]}
                    item["allocations"].append(new_alloc)
                    
                    v = best_opt["vendor"]
                    v_key = "EVELTA" if v == "ELEVTA" else v
                    # Run a mini sequential flow for this new vendor
                    mini_items = [{
                        "component": item["component"],
                        "qty": take_qty,
                        "links": item["links"],
                        "best_url": item["links"].get(v),
                        "original_item": item
                    }]
                    
                    # Store remaining before the cart attempt
                    before_qty = item["remaining_qty"]
                    
                    self._process_vendor_cart_sequentially(v_key, mini_items)
                    
                    # If remaining_qty didn't decrease (meaning the cart addition failed completely),
                    # we must break or we'll loop forever if it doesn't zero the allocation.
                    # Wait, we zero out the allocation on failure now, but current_vendors is built from allocations.
                    # If we zero it out, it's STILL in allocations, so current_vendors WILL contain it, preventing infinite loops.
                    if item["remaining_qty"] >= before_qty:
                        print(f"[RE-ALLOCATE] Cart flow failed to add any units for {v_key}, moving to next fallback.")
                        # remaining_qty hasn't changed, but v_key is in allocations, so it'll skip it next iteration.
                else:
                    break

        # Recalculate final totals based on ACTUAL fulfillment
        optimized_total = 0
        vendor_totals = {v: 0 for v in selected_vendors}
        for item in processed_items:
            for a in item.get("allocations", []):
                vendor_totals[a["vendor"]] += a["total"]
                optimized_total += a["total"]

        # Format totals for final response
        formatted_vendor_totals = {v: f"\u20B9{t:.2f}" for v, t in vendor_totals.items()}
        return {
            "items": processed_items, 
            "vendor_totals": formatted_vendor_totals, 
            "optimized_total": f"\u20B9{optimized_total:.2f}",
            "vendors": selected_vendors,
            "vendor_cart_urls": VENDOR_CART_URLS
        }
