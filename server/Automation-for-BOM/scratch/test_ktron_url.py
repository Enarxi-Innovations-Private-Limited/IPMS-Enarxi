import os
import sys
import pandas as pd
from playwright.sync_api import sync_playwright
from playwright_stealth import stealth_sync
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).parent.parent))

from app.processor import BOMProcessor

def test_ktron():
    processor = BOMProcessor()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        res = processor.search_ktron(page, "10k resistor", 1)
        print(f"Ktron Search Result: {res}")
        browser.close()

if __name__ == "__main__":
    test_ktron()
