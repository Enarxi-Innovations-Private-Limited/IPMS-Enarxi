"""
=============================================================
  ROBU STANDALONE AUTOMATION
  Single-file: Search → Price → Add to Cart → CSV Output
=============================================================

Usage:
  1. Fill your .env file:
       ROBU_EMAIL=your_email@example.com
       ROBU_PASSWORD=your_password

  2. Edit the PRODUCTS list at the bottom of this file.

  3. Run:
       python robu_standalone.py
=============================================================
"""

import asyncio
import csv
import os
import random
import re
import time
from datetime import datetime
from typing import Dict, List, Optional

from dotenv import load_dotenv
from playwright.async_api import async_playwright, BrowserContext, Page

# Load credentials from .env file
load_dotenv()


# ─────────────────────────────────────────────
#  LOGGING HELPER
# ─────────────────────────────────────────────

def log(message: str, prefix: str = "ROBU"):
    """Log action with timestamp"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🔍 {prefix}: {message}")


# ─────────────────────────────────────────────
#  STEALTH BROWSER LAUNCH
#  (Bypasses Cloudflare detection)
# ─────────────────────────────────────────────

async def create_stealth_browser(playwright) -> BrowserContext:
    """
    Launch a persistent browser context with full stealth mode.

    KEY ANTI-DETECTION TECHNIQUES:
      - headless=False          → Cloudflare blocks headless; visible passes
      - channel="chrome"        → Uses real installed Chrome (not bundled Chromium)
      - launch_persistent_context → Keeps cookies/session across products
      - disable-blink-features  → Hides navigator.webdriver flag
      - JS init script          → Patches navigator.webdriver to false at JS level
      - Realistic user-agent    → Looks like Chrome 120 on Windows
    """
    user_data_dir = os.path.join(os.getcwd(), "temp_robu_session")
    os.makedirs(user_data_dir, exist_ok=True)

    context = await playwright.chromium.launch_persistent_context(
        user_data_dir=user_data_dir,
        headless=False,          # MUST be False to pass Cloudflare
        channel="chrome",        # Use real Chrome installed on system
        viewport={"width": 1280, "height": 720},
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        ignore_https_errors=True,
        args=[
            "--disable-blink-features=AutomationControlled",  # Hide webdriver
            "--disable-dev-shm-usage",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-infobars",
        ],
    )

    # JS-level patch: make navigator.webdriver always return false
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    """)

    return context


# ─────────────────────────────────────────────
#  ROBU LOGIN
# ─────────────────────────────────────────────

async def login_to_robu(page: Page) -> bool:
    """
    Log in to Robu using credentials from .env file.
    Skips login if already logged in (persistent session).
    """
    try:
        email = os.getenv("ROBU_EMAIL")
        password = os.getenv("ROBU_PASSWORD")

        if not email or not password:
            print("[!] ROBU_EMAIL / ROBU_PASSWORD not set in .env — skipping login")
            return False

        log("Navigating to Robu login page...")
        await page.goto("https://robu.in/my-account/", wait_until="networkidle", timeout=30000)

        # Check if already logged in
        is_logged_in = (
            await page.locator(
                "a:has-text('Logout'), .woocommerce-MyAccount-navigation-link--customer-logout"
            ).count()
            > 0
        )

        if is_logged_in:
            log("Already logged in — skipping login step")
            return True

        # Fill login form
        if await page.locator("input[name='email'], input[id*='username']").count() > 0:
            log(f"Logging in as {email}...")
            await page.fill("input[name='email'], input[id*='username']", email)
            await page.fill("input[name='password']", password)
            await page.click("button:has-text('Login'), button[name='login']")

            # Wait for dashboard confirmation
            await page.wait_for_selector(
                "a:has-text('Logout'), .woocommerce-MyAccount-navigation-link--dashboard",
                timeout=20000,
            )
            log("✅ Login successful")
            await asyncio.sleep(2)
            return True
        else:
            log("❌ Could not find login form fields")
            return False

    except Exception as e:
        log(f"❌ Login failed: {e}")
        return False


# ─────────────────────────────────────────────
#  ROBU SEARCH
# ─────────────────────────────────────────────

async def search_robu(page: Page, sku: str) -> Optional[str]:
    """
    Search Robu by SKU and return the product page URL.

    STEALTH: Types characters one-by-one with random delays to mimic humans.
    ROBUST:  Uses expect_navigation + wait_for_selector to prevent race conditions.

    Returns product URL string, or None if not found.
    """
    try:
        log(f"Starting search for SKU: {sku}")

        # Navigate to Robu homepage if not already there
        if "robu.in" not in page.url:
            delay = random.uniform(2.0, 4.0)
            log(f"Navigating to Robu ({delay:.1f}s delay)...")
            await asyncio.sleep(delay)
            await page.goto("https://robu.in", wait_until="networkidle", timeout=30000)

        await asyncio.sleep(random.uniform(1.0, 2.5))

        # Find search box (try multiple selectors — Robu changes these)
        search_selectors = [
            'input[type="text"][placeholder*="search"]',
            'input[placeholder*="Search"]',
            'input[class*="search"]',
            'input[role="searchbox"]',
            'input[name*="search"]',
            'input[id*="search"]',
        ]

        search_input = None
        for selector in search_selectors:
            search_input = await page.query_selector(selector)
            if search_input:
                log(f"Found search box: {selector}")
                break

        if not search_input:
            log("❌ Could not find search input box")
            return None

        # Type slowly like a human
        log(f"Typing SKU: {sku}")
        for char in sku:
            await search_input.type(char)
            await asyncio.sleep(random.uniform(0.05, 0.2))

        await asyncio.sleep(random.uniform(0.5, 1.5))
        log("Pressing Enter to search...")

        # KEY: Wait for page navigation triggered by Enter press
        # Using expect_navigation prevents the script from reading the old page
        try:
            async with page.expect_navigation(timeout=15000, wait_until="domcontentloaded"):
                await search_input.press("Enter")
        except Exception:
            log("Navigation wait timed out (AJAX page or slow connection)")

        # KEY: Wait for product links to appear in the MAIN RESULTS container
        # Scoping to .products/.site-main avoids matching header menu links instantly
        try:
            await page.wait_for_selector(
                ".products a[href*='/product/'], "
                ".site-main a[href*='/product/'], "
                ".product-title a, "
                "h2.woocommerce-loop-product__title, "
                "a.product-image-link",
                timeout=15000,
            )
        except Exception:
            log("Timeout waiting for product links — checking current URL...")

        await page.wait_for_timeout(1500)

        # If Robu redirected directly to the product page (exact SKU match)
        if "/product/" in page.url:
            log(f"Direct redirect to product page: {page.url[:70]}")
            return page.url

        # Scroll to trigger lazy content
        await page.evaluate("window.scrollBy(0, 200)")
        await asyncio.sleep(random.uniform(0.5, 1.5))

        # Try multiple product link selectors to find the first result
        product_selectors = [
            'a[href*="/product/"]',
            'a[href*="/p/"]',
            'a[href*="/products/"]',
            'a[class*="product"]',
            'div[class*="product"] a',
            'a[data-testid*="product"]',
        ]

        for selector in product_selectors:
            el = await page.query_selector(selector)
            if el:
                href = await el.get_attribute("href")
                if href:
                    if not href.startswith("http"):
                        href = "https://robu.in" + href
                    log(f"✅ Found product: {href[:70]}")
                    return href

        log("❌ No product found in search results")
        return None

    except Exception as e:
        log(f"❌ Search error: {e}")
        return None


# ─────────────────────────────────────────────
#  ROBU PRICE EXTRACTION
# ─────────────────────────────────────────────

async def extract_price_robu(page: Page, product_url: str) -> Optional[float]:
    """
    Extract the unit price (₹) from a Robu product page.

    STRATEGY 1: Scan ALL visible elements containing ₹ symbol.
    STRATEGY 2: WooCommerce-specific CSS selectors (fallback).
    STRATEGY 3: Save debug screenshot if price not found.

    Returns price as float, or None if not found.
    """
    try:
        # Navigate to product page if not already there
        if page.url != product_url:
            await page.goto(product_url, wait_until="networkidle", timeout=30000)

        log("Page loaded, extracting price...")

        # Wait for page JS to fully render
        await asyncio.sleep(random.uniform(2.0, 4.0))
        await page.evaluate("window.scrollTo(0, 400)")
        await asyncio.sleep(random.uniform(0.5, 1.5))
        await page.mouse.move(random.randint(100, 1000), random.randint(100, 500))

        log("Scanning page for ₹ price...")

        # ── Strategy 1: Find ALL visible elements with ₹ ──
        try:
            locators = page.locator("text=/₹/")
            count = await locators.count()
            prices_found = []

            for i in range(count):
                loc = locators.nth(i)
                if await loc.is_visible():
                    text = await loc.inner_text()
                    match = re.search(r"₹\s*([\d,]+\.?\d*)", text)
                    if match:
                        val = float(match.group(1).replace(",", ""))
                        if 0.1 < val < 500000:  # Filter zeros and totals
                            prices_found.append(val)

            if prices_found:
                price = prices_found[0]  # First is usually unit price
                log(f"✅ Found price via ₹ scan: ₹{price}")
                return price

        except Exception as e:
            log(f"₹ scan failed: {e}")

        # ── Strategy 2: WooCommerce CSS selectors ──
        price_selectors = [
            ".summary .price",
            "p.price",
            ".woocommerce-Price-amount",
            "ins .amount",
            ".price-wrapper .price",
        ]

        for selector in price_selectors:
            try:
                el = page.locator(selector).first
                if await el.is_visible():
                    text = await el.inner_text()
                    match = re.search(r"₹\s*([\d,]+\.?\d*)", text)
                    if match:
                        price = float(match.group(1).replace(",", ""))
                        log(f"✅ Found price via selector '{selector}': ₹{price}")
                        return price
            except:
                continue

        # ── Strategy 3: Debug screenshot ──
        output_dir = os.path.join(os.getcwd(), "output")
        os.makedirs(output_dir, exist_ok=True)
        screenshot_path = os.path.join(output_dir, f"debug_price_{int(time.time())}.png")
        await page.screenshot(path=screenshot_path)
        log(f"❌ No price found. Debug screenshot saved: {screenshot_path}")
        return None

    except Exception as e:
        log(f"❌ Price extraction error: {e}")
        return None


# ─────────────────────────────────────────────
#  ROBU ADD TO CART
# ─────────────────────────────────────────────

async def add_to_cart_robu(page: Page, product_url: str, quantity: int) -> bool:
    """
    Add a product to the Robu cart with the specified quantity.

    KEY FIXES applied from debugging history:
      - Tries multiple quantity input selectors (Robu removed .qty class)
      - Uses text-based button matching (most robust across Robu redesigns)
      - Navigates to cart AFTER clicking to ensure AJAX request completes
        (closing browser early cancels the background request!)

    Returns True if successfully added, False otherwise.
    """
    try:
        # Navigate to product page
        log(f"Navigating to: {product_url[:60]}...")
        if page.url != product_url:
            await page.goto(product_url, wait_until="networkidle", timeout=30000)

        # Scroll and wait for JS hydration
        await page.evaluate("window.scrollTo(0, 800)")
        await page.wait_for_timeout(3000)
        await page.mouse.move(500, 500)

        print(f"[*] Adding {quantity} units to cart")

        # ── Step 1: Set Quantity ──
        # Robu changed from .qty class to input[type='number'] in their redesign
        qty_selectors = [
            "input[name='quantity']",
            "input.qty",
            ".quantity input",
            "input[type='number']",   # Most reliable now
            "input[id*='quantity']",
        ]

        qty_filled = False
        for sel in qty_selectors:
            try:
                qty_input = page.locator(sel).first
                await qty_input.wait_for(timeout=5000)
                if await qty_input.is_visible():
                    await qty_input.fill(str(quantity))
                    print(f"[*] Filled quantity: {quantity}")
                    qty_filled = True
                    break
            except:
                continue

        if not qty_filled:
            print("[!] Could not set quantity — proceeding with default")

        # ── Step 2: Click Add to Cart ──
        # Text-based matching is most robust across Robu layout changes
        add_selectors = [
            "button.product-button",
            "button.single_add_to_cart_button",
            "button[name='add-to-cart']",
            "button:has-text('Add to Cart')",
            "button:has-text('Add to cart')",
        ]

        btn_clicked = False
        for sel in add_selectors:
            try:
                btn = page.locator(sel).first
                await btn.wait_for(state="visible", timeout=5000)
                await btn.click()
                print("[*] Clicked Add to Cart button")
                btn_clicked = True
                break
            except:
                continue

        if not btn_clicked:
            print("[!] Could not find Add to Cart button")
            return False

        # ── Step 3: Wait for AJAX then verify cart ──
        # Robu uses AJAX for cart. If you close the browser too early,
        # the background request gets cancelled and the cart stays empty!
        await page.wait_for_timeout(3000)

        print("[*] Navigating to cart to confirm item was added...")
        await page.goto("https://robu.in/cart/", wait_until="domcontentloaded")
        await page.wait_for_timeout(2000)

        # Verify cart has items
        if await page.locator(".cart-item, .cart_item, td.product-name").count() > 0:
            print("[✓] Successfully added to cart")
            return True
        else:
            print("[!] Cart appears empty — item may not have been added")
            return False

    except Exception as e:
        print(f"[!] Add to cart error: {e}")
        return False


# ─────────────────────────────────────────────
#  CSV OUTPUT
# ─────────────────────────────────────────────

def save_to_csv(results: List[Dict], output_path: str = None):
    """
    Save results to a CSV file in the output/ directory.
    """
    if output_path is None:
        os.makedirs("output", exist_ok=True)
        output_path = os.path.join("output", "result.csv")

    fieldnames = ["Product Name", "SKU", "Quantity", "Unit Price (₹)", "Total Price (₹)", "Cart Link"]

    with open(output_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            writer.writerow({
                "Product Name":    r.get("product_name", ""),
                "SKU":             r.get("sku", "N/A"),
                "Quantity":        r.get("quantity", ""),
                "Unit Price (₹)":  f"₹{r['unit_price']}" if r.get("unit_price") else "Not Available",
                "Total Price (₹)": f"₹{r['total_price']:.2f}" if r.get("total_price") else "Not Available",
                "Cart Link":       r.get("cart_link", ""),
            })

    print(f"\n[✓] CSV saved to: {os.path.abspath(output_path)}")
    return output_path


# ─────────────────────────────────────────────
#  MAIN BATCH RUNNER
# ─────────────────────────────────────────────

async def run_robu_automation(products: List[Dict]) -> List[Dict]:
    """
    Full end-to-end Robu automation for a list of products.

    Each product dict must have:
      - product_name: str
      - sku:          str   (Robu SKU, e.g. "R181525")
      - quantity:     int

    Returns list of result dicts with price and cart link.
    """
    results = []

    async with async_playwright() as p:
        # Launch one stealth browser for the whole batch
        print("\n[*] Launching stealth browser...")
        context = await create_stealth_browser(p)
        page = context.pages[0] if context.pages else await context.new_page()

        # Login once at the start
        print("[*] Logging into Robu...")
        await login_to_robu(page)

        for idx, product in enumerate(products):
            name = product.get("product_name", f"Product {idx + 1}")
            sku = product.get("sku", "")
            quantity = int(product.get("quantity", 1))

            print(f"\n{'─'*55}")
            print(f"[*] Processing {idx + 1}/{len(products)}: {name}")
            print(f"    SKU: {sku} | Qty: {quantity}")
            print(f"{'─'*55}")

            result = {
                "product_name": name,
                "sku":          sku,
                "quantity":     quantity,
                "unit_price":   None,
                "total_price":  None,
                "product_url":  None,
                "cart_link":    "",
                "status":       "Not Found",
            }

            try:
                if not sku:
                    print("  [!] No SKU provided — skipping")
                    result["status"] = "No SKU"
                    results.append(result)
                    continue

                # ── 1. Search ──
                product_url = await search_robu(page, sku)
                if not product_url:
                    result["status"] = "Not Found"
                    results.append(result)
                    continue

                result["product_url"] = product_url

                # Navigate once — reuse for both price and cart
                await page.goto(product_url, wait_until="networkidle", timeout=60000)

                # ── 2. Extract Price ──
                price = await extract_price_robu(page, product_url)
                if price is not None:
                    result["unit_price"]  = price
                    result["total_price"] = price * quantity
                    result["status"]      = "Found"
                    print(f"  [✓] Price: ₹{price} × {quantity} = ₹{price * quantity:.2f}")
                else:
                    print("  [!] Price not found")
                    result["status"] = "Price Not Found"

                # ── 3. Add to Cart ──
                success = await add_to_cart_robu(page, product_url, quantity)
                if success:
                    result["cart_link"] = "https://robu.in/cart/"
                    result["status"]    = "Added to Cart"

            except Exception as e:
                print(f"  [!] Error: {e}")
                result["status"] = f"Error: {e}"

            results.append(result)

            # Human-like delay between products to avoid rate limiting
            await asyncio.sleep(random.uniform(2.0, 4.0))

        # Done — close browser
        print("\n[*] Closing browser...")
        await context.close()

    return results


# ─────────────────────────────────────────────
#  ENTRY POINT — Edit products list here
# ─────────────────────────────────────────────

if __name__ == "__main__":
    # ── Define your products here ──────────────────────────────────────────
    PRODUCTS = [
        {
            "product_name": "25MHz Crystal Oscillator HC-49/US Pack of 5",
            "sku":          "1142182",
            "quantity":     16,
        },
        {
            "product_name": "SMD Multilayer Ceramic Capacitor 100pF",
            "sku":          "R181525",
            "quantity":     20,
        },
        # Add more products here...
        # {
        #     "product_name": "Your Product Name",
        #     "sku":          "YOUR_ROBU_SKU",
        #     "quantity":     10,
        # },
    ]
    # ───────────────────────────────────────────────────────────────────────

    print("""
╔════════════════════════════════════════════╗
║  ROBU STANDALONE AUTOMATION               ║
║  Search → Price → Add to Cart → CSV       ║
╚════════════════════════════════════════════╝
    """)

    results = asyncio.run(run_robu_automation(PRODUCTS))
    save_to_csv(results)

    print("\n── FINAL RESULTS ──")
    for r in results:
        price_str = f"₹{r['unit_price']}" if r["unit_price"] else "N/A"
        print(f"  {r['product_name'][:40]:<40} | {price_str:<12} | {r['status']}")

    print("\n[✓] Done!")