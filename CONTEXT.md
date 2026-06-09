# Agent Context Brief
_Rewrite this completely at the end of every session. Max 40 lines._

## What I Need To Know Right Now
- This is the IPMS-Enarxi PNPM workspace with `client` (Vite React) and `server` (Express).
- The "Add New Item" modal in [MasterDataManagement.jsx](file:///d:/users/hameed/Desktop/Enarxi/Project%20Management/client/src/components/inventory/MasterDataManagement.jsx) has an "Item Code" input field for manual item code creation.
- The backend `/admin/items` route in [inventoryRoutes.js](file:///d:/users/hameed/Desktop/Enarxi/Project%20Management/server/inventoryRoutes.js) accepts manual `itemCode` fields and validates uniqueness.
- Auto-generation of item codes is maintained as a fallback if `itemCode` is not provided (ensures bulk uploads work seamlessly).
- Local validation completed: client build passed.

## Recent Gotchas
- The backend `/admin/items` route did not previously destructure or support `itemCode` from request payloads during creation; this has been added.

## Active Assumptions
- Manual item codes must be unique across all items (validated on backend with 400 response if duplicated).

## Carry-Forward
- Verify the manual creation flow with both unique and duplicate manual item codes to ensure error notifications work.
