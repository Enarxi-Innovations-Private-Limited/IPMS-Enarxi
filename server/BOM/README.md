# 🚀 Multi-Vendor BOM Procurement Automation

A high-performance, real-time automation suite that handles price comparison, dynamic order splitting, and automated cart filling across major Indian electronics vendors — **Robu, Evelta, Ktron, and Sharvi**.

Eliminate manual procurement bottlenecks. The system automatically detects stock caps, extracts tiered pricing, reroutes shortfall quantities to the next cheapest vendor, and handles Out-of-Stock conditions gracefully — all without human intervention.

---

## 🌟 Key Features

- **📊 Dynamic Split-Order Procurement**
  Detects if a vendor has insufficient stock and reroutes remaining quantity to the next lowest-priced supplier in real-time. Ensures 100% BOM fulfillment.

- **💰 Intelligent Tiered Price Extraction**
  Automatically parses MOQ quantity-range pricing tables on all vendors to lock in the best bulk-order unit price.

- **🛒 Multi-Vendor Cart Automation**
  | Vendor | Platform | Notes |
  |---|---|---|
  | **Robu** | Custom WooCommerce | JS-based qty override, ₹10 minimum order rule, SLUG-based cart verification |
  | **Evelta** | BigCommerce | JIT login, "You added to cart" modal detection, OOS ("Sold Out") early exit |
  | **Ktron** | WooCommerce | Session persistence, JIT re-login on expiry |
  | **Sharvi** | WooCommerce | Side-drawer cart detection and auto-close |

- **🔄 Just-In-Time (JIT) Login Recovery**
  All vendors support automatic session recovery. If a session expires mid-run, the system re-authenticates and continues from where it left off — no manual intervention needed.

- **🚫 Out-of-Stock (OOS) Detection**
  - **Robu**: Detects "Add to Waitlist" button before touching the cart
  - **Evelta**: Detects "Sold Out" text and "Notify Me" form before any cart interaction
  Both immediately fall back to the next cheapest vendor.

- **🛡️ Stealth Session Persistence**
  Uses `Playwright-Stealth` and persistent local session caching to reliably bypass Cloudflare bot detection across all vendors.

- **⚡ Parallel Phase 1 Search**
  Concurrent vendor price scouting via `ThreadPoolExecutor` with thread-isolated browser contexts, followed by sequential cart filling to avoid conflicts.

- **📈 Real-Time Dashboard**
  Live BOM table showing vendor prices, selected quantities, allocation breakdowns, total cost, and OOS badges — all updated in real-time.

---

## 🏗️ Architecture

```
Automation-for-BOM/
├── app/
│   ├── main.py          # FastAPI server — UI backend & API routes
│   └── processor.py     # Orchestration engine — parallel search, allocation, cart flow
├── automation/
│   ├── cart.py          # Multi-vendor cart interaction (WooCommerce & BigCommerce)
│   └── robu.py          # Robu.in specialized scraper & tiered pricing extractor
├── static/
│   └── index.html       # Real-time dashboard UI
├── session/             # Auto-generated browser session state (gitignored)
├── output/              # Exported result CSVs (gitignored)
├── .env                 # Vendor credentials (not committed)
└── requirements.txt
```

---

## 🛠️ Installation

### 1. Clone the repository
```bash
git clone https://github.com/SOWMIYA-GOWDA/Automation-for-BOM.git
cd Automation-for-BOM
```

### 2. Create and activate a virtual environment
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Install Playwright browser
```bash
playwright install chromium
```

---

## ⚙️ Configuration

Copy the example config and fill in your credentials:

```bash
cp .env.example .env
```

Then edit `.env` with your actual vendor credentials. The `.env.example` file in the repo shows all required keys.

> Sessions are saved locally to the `session/` directory on first login and reused on subsequent runs.

---

## 🏃 How to Run

```bash
python -m app.main
```

Then open **http://127.0.0.1:8000** in your browser.

### Workflow
1. **Upload** your BOM Excel (`.xlsx`) file
2. **Map** the `Component` and `Quantity` columns
3. Click **"Compare Prices & Optimize"** — Phase 1 parallel vendor search runs
4. Review the optimized vendor allocation table with price breakdowns
5. Click **"Add to Cart"** — Phase 2 sequential cart filling executes across all vendors
6. Items are verified in each vendor's cart and corrected automatically if needed

---

## 📋 BOM Excel Format

Your Excel file should have at minimum:

| Component | Quantity | SKU (optional) |
|---|---|---|
| 220R | 520 | 058-0603SAF2200T5E |
| 470R | 80 | |
| 15R | 30 | 0603WAF150JT5E |

> If a **SKU** column is provided, Evelta will use it for direct SKU-based product search (more reliable than text search).

---

## 🔍 How Vendor Selection Works

```
Phase 1 (Parallel):   Scout all vendors simultaneously for prices & stock
Phase 2 (Sequential): For each BOM item, pick cheapest vendor → add to cart → verify qty
                       ↓ If OOS or qty mismatch → fallback to next cheapest vendor
                       ↓ If partial stock → split order, re-allocate remainder
```
