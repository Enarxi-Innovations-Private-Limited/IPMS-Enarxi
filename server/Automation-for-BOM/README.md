# 🚀 Multi-Vendor BOM Procurement Automation

A high-performance, real-time automation suite designed to standardize inventory verification, price comparison, and dynamic order splitting across major electronics vendors (Robu, Evelta, Ktron, and Sharvi).

Eliminate manual procurement bottlenecks with a system that automatically detects stock caps, performs keyboard-level quantity corrections, and reroutes shortfall quantities to the next available, lowest-priced vendor.

---

## 🌟 Key Features

- **📊 Dynamic Split-Order Procurement**
  Automatically detects if a vendor has insufficient stock during cart insertion and reroutes the remaining balance to the next lowest-priced supplier in real-time, ensuring complete BOM fulfillment.
  
- **🛒 Standardized Cart Automation**
  - **Robu (Custom)**: Advanced quantity override logic (precise `Ctrl+A` + `Backspace` input) to prevent legacy cart-stacking bugs.
  - **Evelta (BigCommerce)**: Just-in-Time (JIT) login, precise stock-cap parsing, and graceful error modal handling.
  - **Ktron & Sharvi (WooCommerce)**: Real-time stock-error detection with automatic quantity scaling and retries.

- **🛡️ Stealth Session Persistence**
  Utilizes `Playwright-Stealth` and persistent session caching (`state.json`) across isolated browser contexts to reliably bypass Cloudflare bot detection and prevent account bans.

- **📉 Intelligent Price Tiering**
  Automatically extracts tiered bulk pricing (MOQ discounts) from all vendors, falling back to base prices when necessary, to ensure the absolute lowest BOM cost calculation.

- **⚡ High-Throughput Parallel Processing**
  Concurrent vendor searches using `ThreadPoolExecutor` with thread-isolated browser contexts to maximize scraping and cart-addition speed.

- **🚫 Smart Out-of-Stock (OOS) Handling**
  Accurately identifies out-of-stock items, gracefully displaying fallback pricing without attempting to add unavailable items to the cart, preventing workflow interruptions.

---

## 🛠️ Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/SOWMIYA-GOWDA/Automation-for-BOM.git
   cd Automation-for-BOM
   ```

2. **Create and activate a virtual environment**:
   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate  
   # macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Install Playwright Browsers**:
   ```bash
   playwright install chromium
   ```

---

## ⚙️ Configuration

Create a `.env` file in the root directory with your vendor credentials. The system uses these to auto-login and persist your sessions locally inside the `session/` directory.

```env
# Robu Credentials
ROBU_EMAIL=your_email@example.com
ROBU_PASSWORD=your_password

# Evelta Credentials
EVELTA_EMAIL=your_email@example.com
EVELTA_PASSWORD=your_password

# Ktron/Sharvi (WooCommerce) Credentials
KTRON_EMAIL=your_email@example.com
KTRON_PASSWORD=your_password
SHARVI_EMAIL=your_email@example.com
SHARVI_PASSWORD=your_password
```

---

## 🏃 How to Run

1. **Start the Procurement Server**:
   ```bash
   python -m app.main
   ```
2. **Access the Dashboard**: 
   Open `http://127.0.0.1:8000` in your browser.
3. **Process BOM**:
    - Upload your Excel (`.xlsx`) file.
    - Map the `Component` and `Quantity` columns.
    - Click **"Compare Prices & Optimize"**.
    - Review the optimized split-order table.
    - Click **"View Cart"** to execute one-click automated checkout across all mapped vendors.

---

## 📂 Architecture

- **`app/processor.py`**: The orchestration engine managing parallel execution, price comparison, tier extraction, and dynamic order splitting.
- **`app/main.py`**: The FastAPI server handling the UI backend and websocket connections.
- **`automation/cart.py`**: Standardized interaction layer for multi-vendor cart management (WooCommerce & BigCommerce logic).
- **`automation/robu.py`**: Highly specialized scraper and cart-handler specifically for Robu.in's unique frontend architecture.
- **`static/`**: Responsive UI for real-time progress monitoring and displaying dynamic multi-vendor price breakdowns.
- **`session/`**: Secure, local storage for browser state and Cloudflare-bypass cookies to maintain persistent logins across runs.
