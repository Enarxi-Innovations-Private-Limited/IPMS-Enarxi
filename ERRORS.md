# Known Errors & Gotchas

## Solved
- **Missing Pending Quantity Updates**: Found that `PurchaseRequestBatch` lines were not being updated during inward, leading to inconsistent state. Fixed in `server/inventoryRoutes.js`.
- **Placeholder PO Status**: PO status remained `PLACED` even after full receipt. Fixed by adding `RECEIVED` status and automatic transition logic.
- **Manual Stock Visibility**: "Super User" manual entries were not updating stock because they were being flagged for approval instead of being applied directly. Fixed by adding `SUPER_USER` to the admin check.

## Open
- **Serial Validation**: Serial number entry is currently comma-separated text without strict validation against quantity or unique constraints.
- **Race Conditions**: Some routing transitions still occur outside of unified transactions (to be addressed).
