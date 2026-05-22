# Project Context: IPMS-Enarxi (Financial Suite)

## Global Architecture
*   **Frontend**: React (Vite) on Port 3000 (production) / Port 5173 (development).
*   **Main Backend**: Express (Port 5000) - Authoritative source for Inventory, Projects, and Tasks.
*   **Automation Engine**: Python/FastAPI (Port 8000) - Specialized BOM optimization and multi-vendor scraper.
*   **Proxy Layer**: The main backend (`server.js`) acts as a reverse proxy for all BOM requests via `/api/bom*`.

## Unified Design System (Financial Suite)
*   **Background**: `#ECF1FF` (Light Blue/Indigo)
*   **Panels/Cards**: `#FFFFFF` (White)
*   **Typography**: `#002045` (Deep Navy) - Updated from slate charcoal for better contrast and premium feel.
*   **Status Indicators**: Consistent color coding (e.g., Emerald for Approved, Amber for Pending, Rose for Shortage).
*   **Interactive Search & Filters**: Integrated high-performance client-side filters matching custom dark/light color rules of the Financial Suite across core ledger pages.

## Critical Procurement Workflow
1.  **Routing**: Admin routes Material Request lines. Stock is NOT reserved at this stage to prevent premature locking.
2.  **Confirmation**: Store Manager verifies physical stock. This action triggers the actual inventory reservation.
3.  **Shortage Detection**: If physical stock < system stock, `SHORTAGE_REPORTED` is flagged for admin review.
4.  **Approval**: Admins approve shortages, routing them to the `PurchaseRequestBatch` queue.
5.  **Optimization**: `PurchasingHub.jsx` pulls these shortages into the Python BOM Engine for vendor allocation.
6.  **Dispatch**: Confirmed items are dispatched, releasing reservations and deducting from physical on-hand.

## Key Files & Modules
*   **Environment Configuration**: Root `.env` (derived from `.env.save`/`.env.example`) controls global parameters including database connect strings (`MONGODB_URI`), environment mode (`NODE_ENV`), and local routing.
*   **BOM Logic**: `server/BOM/app/processor.py` (Optimization) and `server/BOM/automation/cart.py` (Scrapers).
*   **API Gateway**: `server.js` (Proxying and Auth).
*   **Inventory Logic**: `server/inventoryRoutes.js` (Shortage management).
*   **Purchasing UI**: `client/src/components/inventory/PurchasingHub.jsx`.
*   **Authentication**: `client/src/components/auth/LoginPage.jsx` (Now using Navy branding).
*   **Inventory Master Data & Stock Registry**: `client/src/components/inventory/MasterDataManagement.jsx` (Fixed conditional block syntax error) and `client/src/components/inventory/StockOverview.jsx` (Now featuring advanced filtering controls).

## Security & Auth
*   All routes are protected by `authMiddleware` (JWT).
*   Tokens can be passed via `Authorization` header or `token` query parameter (for file downloads).
