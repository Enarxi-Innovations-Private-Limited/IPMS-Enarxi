            # Allow time for navigation to trigger naturally
            page.wait_for_timeout(4000) 
            page.wait_for_load_state("networkidle", timeout=60000)

            print(f"✅ Search result reached: {page.url}")
            return True
        except Exception as e:
            print(f"❌ safe_search failed for {url}: {e}")
            return False

    def generic_site_handler(self, page, site_name, base_url, product, use_sku=False, quantity=1, validation_sku=None):
        """Standardized handler with SKU-first matching"""
        if use_sku and not validation_sku:
            validation_sku = product
            
        search_type = "SKU" if use_sku else "Name"
        print(f"[{site_name}] 🔍 Scouting by {search_type}: {product}")
        
        time.sleep(random.uniform(1.5, 3))
        search_url = base_url

        if not self.safe_search(page, search_url, product):
            return None

        try:
            # === VENDOR-SPECIFIC PRODUCT PAGE NAVIGATION ===
            # MUST click and open product page to get correct tiers
            
            vendor_key = site_name.upper().strip()
            if vendor_key in ["EVELTA", "ELEVTA"]:
                # EVELTA: Priority SKU matching with validation
                if "/search-results-page" in page.url or "search" in page.url or "q=" in page.url:
                    # Look for links that take us to the actual product page
                    link_selectors = [
                        "a[href*='/product/']",
                        ".card-title a",
                        ".product-item-name a",
                        ".product-title a",
                        ".productCard-title a"
                    ]
                    
                    product_links = page.locator(", ".join(link_selectors))
                    
                    if product_links.count() > 0:
                        target_link = None
                        if use_sku and product.strip():
                            # SKU-first: Try to find exact product match in link text
                            for i in range(product_links.count()):
                                try:
                                    link_text = product_links.nth(i).inner_text().lower()
                                    if product.lower() in link_text:
                                        target_link = product_links.nth(i)
                                        break
                                except: continue
                        
                        if not target_link:
                            target_link = product_links.first
                        
                        target_link.click(force=True)
                        page.wait_for_load_state("networkidle", timeout=60000)
                        time.sleep(3)
                    
                # Ensure we wait for the pricing table to appear on the product page
                try:
                    page.wait_for_selector("table", timeout=5000)
                except: pass
                
            elif vendor_key == "KTRON":
                if "?s=" in page.url:
                    product_links = page.locator("a[href*='/product/']")
                    if product_links.count() > 0:
                        product_links.first.click(force=True)
                        page.wait_for_load_state("networkidle", timeout=60000)
                        time.sleep(2)
            
            elif vendor_key == "SHARVI":
                if "product" not in page.url:
                    product_links = page.locator("a[href*='/product/']")
                    if product_links.count() > 0:
                        product_links.first.click(force=True)
                        page.wait_for_load_state("networkidle", timeout=60000)
                        time.sleep(2)
            
            elif vendor_key == "ROBU":
                if "?s=" in page.url:
                    product_links = page.locator("a[href*='/product/']")
                    if product_links.count() > 0:
                        product_links.first.click(force=True)
                        page.wait_for_load_state("networkidle", timeout=60000)
                        time.sleep(2)

            # === PRICE EXTRACTION (UNIVERSAL WITH TIERS) ===
            tiers = extract_pricing_tiers(page, site_name)
            
            if tiers:
                print(f"[{site_name}] ✅ {len(tiers)} pricing tiers found")
                price_value = get_price_from_tiers(tiers, quantity, site_name)
                print(f"[{site_name}] ✅ Calculated tier price for qty {quantity}: ₹{price_value:.2f}")
            else:
                print(f"[{site_name}] No pricing tiers found, using fallback extraction")
                price_value = self.extract_price_from_page(page, site_name, quantity)
            
            if price_value is not None:
                return {
                    "site": site_name,
                    "price": price_value,
                    "url": page.url
                }
            return None

        except Exception as e:
            print(f"[{site_name}] ❌ Error in generic_site_handler: {e}")
            return None
