"""
Cart Automation Module
Handles adding products to cart and generating cart links
"""
from typing import Dict, Optional
import asyncio
import os
from dotenv import load_dotenv
from playwright.sync_api import Page

load_dotenv()

class CartAutomation:
    """Cart automation for selected website"""
    async def login_to_robu(self, page: Page) -> bool:
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
            # Use simple wait_for_load_state instead of networkidle to be more sturdy
            await page.goto("https://robu.in/my-account/", timeout=30000)
            await page.wait_for_load_state("domcontentloaded")

            # Check if already logged in
            is_logged_in = await page.locator(
                "a:has-text('Logout'), .woocommerce-MyAccount-navigation-link--customer-logout"
            ).count() > 0

            if not is_logged_in:
                if await page.locator("input[name='email'], input[id*='username']").count() > 0:
                    print(f"[*] Logging in as {email}...")
                    await page.fill("input[name='email'], input[id*='username']", email)
                    await page.fill("input[name='password']", password)
                    await page.click("button:has-text('Login'), button[name='login']")
                    
                    # Wait for dashboard to confirm login success
                    await page.wait_for_selector(
                        "a:has-text('Logout'), .woocommerce-MyAccount-navigation-link--dashboard",
                        timeout=20000
                    )
                    print("[✓] Login successful")
                    await asyncio.sleep(2)
                else:
                    print("[!] Could not find login fields or logout link.")
            else:
                print("[*] Already logged in to Robu")
            
            return True
        except Exception as e:
            print(f"[!] Login failed: {e}")
            return False

    async def add_to_cart_robu(self, page: Page, product_url: str, quantity: int) -> Dict:
        """
        Add product to Robu cart using an existing (already logged-in) page
        """
        try:
            # Re-login check if session dropped
            if "robu.in/my-account" not in page.url and "robu.in/cart" not in page.url:
                await page.goto("https://robu.in/my-account/", wait_until="domcontentloaded", timeout=30000)
                email = os.getenv("ROBU_EMAIL")
                password = os.getenv("ROBU_PASSWORD")
                if await page.locator("input[name='email'], input[id*='username']").count() > 0:
                    print(f"[*] Not logged in. Logging into Robu as {email}")
                    try:
                        await page.fill("input[name='email'], input[id*='username']", email)
                        await page.fill("input[name='password']", password)
                        await page.click("button:has-text('Login'), button[name='login']")
                        await page.wait_for_load_state("networkidle")
                    except Exception as e:
                        print(f"[!] Login failed or skipped: {e}")

            # Navigate to product page
            print(f"[*] Navigating to product page: {product_url}")
            if page.url != product_url:
                await page.goto(product_url, wait_until="networkidle", timeout=30000)

            # Scroll and wait for JS hydration
            await page.evaluate("window.scrollTo(0, 800)")
            await page.wait_for_timeout(3000)
            await page.mouse.move(500, 500)  # Trigger hover states

            # ── QUANTITY INPUT: Multiple selectors (Robu changed .qty class) ──
            qty_selectors = [
                "input[name='quantity']",
                "input.qty",
                ".quantity input",
                "input[type='number']",  # ← Most reliable now
                "input[id*='quantity']"
            ]
            qty_found = False
            for sel in qty_selectors:
                try:
                    quantity_input = page.locator(sel).first
                    await quantity_input.wait_for(timeout=5000)
                    if await quantity_input.is_visible():
                        await quantity_input.fill(str(quantity))
                        print(f"[*] Filled quantity: {quantity}")
                        qty_found = True
                        break
                except:
                    continue

            if not qty_found:
                print("[*] Could not find quantity input, moving to add button...")

            # ── ADD TO CART BUTTON: Text-based matching is most robust ──
            add_selectors = [
                "button.product-button",
                "button.single_add_to_cart_button",
                "button[name='add-to-cart']",
                "button:has-text('Add to Cart')",
                "button:has-text('Add to cart')"
            ]
            
            btn_clicked = False
            for sel in add_selectors:
                try:
                    add_btn = page.locator(sel).first
                    await add_btn.wait_for(state="visible", timeout=5000)
                    await add_btn.click()
                    print(f"[*] Clicked Add to Cart button")
                    btn_clicked = True
                    break
                except:
                    continue

            if btn_clicked:
                # ── KEY: Wait for AJAX request to complete before closing ──
                await page.wait_for_timeout(3000)
                
                # Navigate to cart to FORCE the session to persist
                print("[*] Navigating to cart to finalize...")
                await page.goto("https://robu.in/cart/", wait_until="domcontentloaded")
                await page.wait_for_timeout(2000)
                
                if await page.locator(".cart-item, .cart_item, td.product-name").count() > 0:
                    print(f"[✓] Successfully added to cart")
                    return {
                        "success": True,
                        "cart_url": "https://robu.in/cart/",
                        "message": "Added to cart successfully"
                    }
                else:
                    print("[!] Item might not have been added correctly.")
                    return {
                        "success": False,
                        "message": "Item not found in cart after adding",
                        "cart_url": product_url
                    }
            else:
                return {
                    "success": False,
                    "message": "Could not find add to cart button",
                    "cart_url": product_url
                }
        except Exception as e:
            return {
                "success": False,
                "message": f"Error adding to cart: {str(e)}",
                "cart_url": product_url
            }
