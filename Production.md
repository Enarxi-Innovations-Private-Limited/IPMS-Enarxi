# Production Deployment Guide: BOM Automation & PM Server

This document outlines the step-by-step process for deploying the integrated Project Management (PM) Server and BOM Automation service on a **Linux VPS**.

---

## Phase 1: OS Level Prerequisites
Ensure your Linux VPS (Ubuntu/Debian recommended) has the necessary runtimes.

1.  **Update System**:
    ```bash
    sudo apt update && sudo apt upgrade -y
    ```
2.  **Install Python 3.11+ & Node.js**:
    ```bash
    sudo apt install python3-pip python3-venv nodejs npm -y
    ```
3.  **Install Playwright Linux Dependencies**:
    Playwright requires specific system libraries to run browsers in headless mode.
    ```bash
    sudo npx playwright install-deps
    ```

---

## Phase 2: Deployment & Setup

1.  **Clone / Transfer Code**:
    Deploy your `Project Management` folder to `/var/www/project-management`.

2.  **Node.js Backend Setup**:
    ```bash
    cd /var/www/project-management/server
    npm install
    ```

3.  **Python Virtual Environment (Venv)**:
    ```bash
    cd Automation-for-BOM
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    playwright install chromium
    deactivate
    cd ..
    ```

---

## Phase 3: Environment Configuration

Ensure your `.env` file in the `server` directory contains all necessary credentials:

```env
# Database
MONGODB_URI=your_mongodb_connection_string

# Vendor Credentials (for Cart Automation)
ROBU_EMAIL=your_email
ROBU_PASSWORD=your_password
EVELTA_EMAIL=your_email
EVELTA_PASSWORD=your_password
SHARVI_EMAIL=your_email
SHARVI_PASSWORD=your_password
KTRON_EMAIL=your_email
KTRON_PASSWORD=your_password
```

---

## Phase 4: Production Launch (PM2)

We recommend using **PM2** to manage the Node.js process. It will automatically handle the Python BOM process since the PM server spawns it as a child.

1.  **Install PM2**:
    ```bash
    sudo npm install -g pm2
    ```

2.  **Update `server.js` for Linux Paths**:
    Ensure `server.js` uses the correct path to the Python executable. On Linux, it is `venv/bin/python` (not `venv/Scripts/python.exe`).

    > [!TIP]
    > In `server.js`, I've implemented a check that automatically detects if it's running on Windows or Linux to choose the correct path.

3.  **Start the Server**:
    ```bash
    pm2 start server.js --name "pm-server"
    ```

4.  **Monitor Logs**:
    ```bash
    pm2 logs pm-server
    ```
    *You will see `[BOM]` prefixed logs directly in the PM2 output.*

---

## Phase 5: Visual Monitoring & Remote Access (Optional)

Since a VPS is "headless" (no screen), you might want to see what the automation is doing.

### 1. Understanding Server-Side Execution
The automation runs **on the VPS**, not on the user's computer. 
- **User Side**: Any browser (Phone, Chrome, Safari, etc.) can access the dashboard. They **do not** need Chrome installed.
- **Server Side**: Playwright manages its own Chromium instance.

### 2. How to "See" the Browser on a VPS
If you need to debug or watch the automation live on the Linux server:

**Option A: Playwright Traces (Recommended)**
Playwright can record a "Trace" file that you can download and open locally to see exactly what happened:
1. In `processor.py`, enable tracing.
2. Download the `.zip` trace file.
3. Open it at [trace.playwright.dev](https://trace.playwright.dev).

**Option B: Virtual Display (VNC)**
If you want to see the browser window live:
1. Install a virtual frame buffer:
   ```bash
   sudo apt install xvfb x11vnc
   ```
2. Run the server with a virtual display:
   ```bash
   xvfb-run --server-args="-screen 0 1280x800x24" npm start
   ```
3. Connect via VNC to view the "hidden" screen.

---

## Phase 6: Troubleshooting Linux VPS

### 1. Port 8000 & 5000 Access
Ensure your VPS firewall (UFW/Security Groups) allows traffic on the ports:
- `5000`: Main PM API
- `8000`: BOM Automation Dashboard

### 2. Playwright Headless Mode
On some Linux servers, you might need `xvfb` if browsers fail to launch:
```bash
sudo apt install xvfb
xvfb-run node server.js
```

### 3. Memory Constraints
BOM Automation uses Playwright (browser instances). Ensure your VPS has at least **2GB RAM** (4GB recommended) to handle multiple parallel vendor searches.
