# Project Context: IPMS-Enarxi (Financial Suite)

## Global Architecture
*   **Frontend**: React (Vite) on Port 3000.
*   **Main Backend**: Express (Port 5000) - Authoritative source for Inventory, Projects, and Tasks.
*   **Automation Engine**: Python/FastAPI (Port 8000) - Specialized BOM optimization and multi-vendor scraper.
*   **Proxy Layer**: The main backend (`server.js`) acts as a reverse proxy for all BOM requests via `/api/bom*`.

## Unified Design System (Financial Suite)
*   **Background**: `#ECF1FF` (Light Blue/Indigo)
*   **Panels/Cards**: `#FFFFFF` (White)
*   **Typography**: `#556070` (Slate Charcoal) - Used for primary text and headings.
*   **Status Indicators**: Consistent color coding (e.g., Emerald for Approved, Amber for Pending, Rose for Shortage).

## Critical Procurement Workflow
1.  **Shortage Detection**: `StoreRequestsPage.jsx` allows reporting shortages during fulfillment.
2.  **Approval**: Admins approve shortages, routing them to the `PurchaseRequestBatch` queue.
3.  **Optimization**: `PurchasingHub.jsx` pulls these shortages into the Python BOM Engine via the `/api/inventory/shortages/send-to-bom` bridge.
4.  **Vendor Allocation**: The BOM engine scrapes Robu, Evelta, Ktron, and Sharvi to find the best prices.
5.  **Execution**: Results are exported to Excel or used to automatically fill vendor carts (Robu ₹10 rule enforced).

## Key Files & Modules
*   **BOM Logic**: `server/BOM/app/processor.py` (Optimization) and `server/BOM/automation/cart.py` (Scrapers).
*   **API Gateway**: `server.js` (Proxying and Auth).
*   **Inventory Logic**: `server/inventoryRoutes.js` (Shortage management).
*   **Purchasing UI**: `client/src/components/inventory/PurchasingHub.jsx`.

## Security & Auth
*   All routes are protected by `authMiddleware` (JWT).
*   Tokens can be passed via `Authorization` header or `token` query parameter (for file downloads).
