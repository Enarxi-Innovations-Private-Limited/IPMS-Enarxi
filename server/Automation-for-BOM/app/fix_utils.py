def extract_pricing_tiers(page, site_name):
    """Extract ALL pricing tiers from table (qty ranges and prices)"""
    tiers = []
    
    try:
        page.wait_for_selector("table", timeout=10000)
    except:
        pass
        
    try:
        rows = page.locator("table tr").all()
        print(f"[{site_name}] Extracting pricing tiers from {len(rows)} rows")
        
        for i, row in enumerate(rows):
            row_text = row.inner_text()
            
            # Check for SHARVI format first: 50 - 200 ₹0.81
            sharvi_match = re.search(r"(\d+)\s*-\s*(\d+).*?(?:₹|Rs\.?)\s*(\d+\.?\d*)", row_text)
            if sharvi_match:
                try:
                    min_q = int(sharvi_match.group(1))
                    max_q = int(sharvi_match.group(2))
                    price = float(sharvi_match.group(3))
                    if price > 0: # Allow small prices for resistors
                        tiers.append((min_q, max_q, price))
                        print(f"[{site_name}] Tier [{i}]: {min_q}-{max_q} → ₹{price:.2f}")
                    else:
                        print(f"[{site_name}] REJECTED invalid price: ₹{price:.2f}")
                except:
                    pass
                continue
                
            # Look for quantity range (e.g., "1+", "10+", "25+", "100+")
            qty_match = re.search(r"(\d+)\s*(?:\+|-|TO)", row_text, re.IGNORECASE)
            # Look for price (various formats: ₹X, Rs. X, X)
            price_match = re.search(r"(?:₹|Rs\.?)\s*(\d+\.?\d*)", row_text)
            
            if qty_match and price_match:
                try:
                    min_q = int(qty_match.group(1))
                    price = float(price_match.group(1))
                    
                    # Handle ranges like "10-4999" for Robu
                    max_q = float('inf')
                    range_match = re.search(r"(\d+)\s*-\s*(\d+)", row_text)
                    if range_match:
                        max_q = int(range_match.group(2))
                    
                    tiers.append((min_q, max_q, price))
                    print(f"[{site_name}] Tier [{i}]: {min_q}-{max_q} → ₹{price:.2f}")
                except:
                    continue
        
        if tiers:
            # Sort by quantity ascending
            tiers.sort(key=lambda x: x[0])
            print(f"[{site_name}] Total tiers found: {len(tiers)}")
            return tiers
        else:
            print(f"[{site_name}] No pricing tiers found")
            return []
    
    except Exception as e:
        print(f"[{site_name}] Error extracting tiers: {e}")
        return []

def get_price_from_tiers(tiers, required_qty, site_name=""):
    """Select correct price based on required quantity and available tiers"""
    if not tiers:
        return None
    
    # Fill in max_qty for standard + formats to prevent overlap
    for j in range(len(tiers)):
        if tiers[j][1] == float('inf') and j < len(tiers) - 1:
            tiers[j] = (tiers[j][0], tiers[j+1][0] - 1, tiers[j][2])
            
    for min_q, max_q, price in tiers:
        if min_q <= required_qty <= max_q:
            print(f"[{site_name}] Qty: {required_qty} matched tier {min_q}-{max_q} → Price: ₹{price:.2f}")
            return price

    print(f"[{site_name}] No matching tier for qty {required_qty}")
    return None

def human_delay():
    time.sleep(random.uniform(2, 4))
