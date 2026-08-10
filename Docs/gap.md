# Inventory Tracker Replica Gap Analysis

Date: 2026-05-11

Compared codebases:

- Source of truth: `C:\Users\Hameed\Desktop\Enarxi\Inventory-tracker`
- Replica target: `C:\Users\Hameed\OneDrive - Enarxi Innovations Pvt Ltd\Enarxi\Project Management`

## Verdict

No, the inventory integration is not yet a full 1:1 replica.

It is now a strong functional port of the standalone `Inventory-tracker`, and most of the big operational gaps from the earlier audit have been closed.

## Updated Completion Estimate

Overall replica completeness: `96%`

Breakdown:

- Feature surface parity: `96%`
- Core workflow parity: `96%`
- Frontend/backend contract parity: `97%`
- Traceability and audit parity: `88%`
- Schema fidelity parity: `89%`
- Production-grade integrity parity: `87%`

## What Is Now Solidly Replicated

- Core inventory entities exist in PM:
  `Classification`, `Vendor`, `Item`, `ItemVendorSku`, `StockLocation`, `StockBalance`, `StockMovement`, `MaterialRequest`, `StoreRequestBatch`, `DispatchBatch`, `PurchaseRequestBatch`, `PurchasePlanLine`, `PurchaseOrder`, `PurchaseOrderLineAllocation`, `PurchaseInwardBatch`, `StockAdjustmentBatch`, `AuditLog`
- Main workflow is present:
  `Material Request -> Admin Routing -> Store / Purchase -> PO -> Inward -> Dispatch -> Engineer Acknowledgement`
- Item code generation is aligned to 6-digit format.
- Stock overview and service contracts are much closer to the original.
- Purchase planning is implemented in usable form with grouped demand, vendor selection, SKU mapping lookup, order quantity, rate, and GST editing.
- Draft and rejected purchase orders can now be formally submitted into the admin approval queue, matching the tracker’s `PENDING_ADMIN_APPROVAL` handoff more closely.
- PO generation now allocates ordered quantity back to source purchase-request lines instead of duplicating quantity across every source.
- Shortage amendment is implemented.
- Store Manager can now route submitted material-request lines directly to Purchase in PM, while Store-routing remains limited to super-user/admin-side roles.
- Material-request routing is now closer to the tracker by enforcing stock-aware store/purchase quantity limits instead of allowing arbitrary split quantities.
- Vendor SKU mapping APIs exist.
- Stock transfer exists.
- Audit log infrastructure exists and is used in multiple important flows.
- Basic serial capture and serial-history lookup exist.
- Route-level role guards are present on many of the main mutation endpoints.
- Mongo sessions and transactions are now present in several key flows, including master-data updates, PO generation, and purchase inward receipt.
- Inventory frontend alert popups have been replaced with in-app notifications, so operational feedback now matches the rest of the PM application better.

## Major Gaps Still Remaining

### 1. Audit logging is real now, but still not complete across the module

Current PM state:

- `AuditLog` exists as a first-class model.
- Audit writes now exist for master-data create/update/delete, store confirmation, dispatch creation/acknowledgement, PO creation/review/placement, inward creation, stock approval, shortage amendment, stock transfer, and some other inventory operations.

What is still missing:

- Not every inventory mutation path writes before/after audit snapshots.
- Coverage is still uneven across some routing transitions, receive-side downstream effects, and a few operational edits.
- Activity logging still carries part of the observability burden where true audit logging should exist.

Impact:

- Audit parity is now strong across the main workflow, but not yet fully uniform enough to call complete.

Status:

- `Mostly complete`

### 2. End-to-end serial traceability is still partial

Current PM state:

- `serialNumbers` are stored on stock movements, purchase inward lines, and dispatch lines.
- The traceability screen can search history using serial-aware stock history filtering.
- Purchase inward auto-routing now writes real `purchaseInwardLineId` links onto downstream store lines.

What is still missing:

- The traceability path is still history-driven rather than backed by a dedicated serial-custody model.
- PM still does not maintain a fully explicit serial-by-serial custody chain across every downstream handoff.
- Serial validation rules and downstream enforcement are still lighter than the original tracker's intent.

Impact:

- Serial support is operational, but not yet full parity with a clean, allocation-backed custody trail.

Status:

- `Partially complete`

### 3. Schema fidelity is much better, but still not perfectly normalized

Current PM state:

- PM now includes normalized `PurchasePlanLine` and `PurchaseOrderLineAllocation`.
- `StoreRequestBatch.lines.purchaseInwardLineId` exists in schema and is now populated in the purchase inward auto-routing flow.

What is still missing:

- PM still relies heavily on embedded document flows, especially around downstream routing and fulfillment.
- The original tracker still has stronger relational certainty around some downstream allocation lineage.
- A few structurally normalized concepts still behave as document-centric approximations in PM.

Impact:

- PM is now much closer structurally, but it is still not a perfect model-level replica.

Status:

- `Mostly complete`

### 4. Purchase receive parity is now strong, but serial-grade hardening still remains

Current PM state:

- `receivePurchaseOrderLines` is now transaction-wrapped.
- Receipt now updates `PurchaseOrderLineAllocation` using true remaining allocation quantities.
- Auto-routed store lines now carry the actual `purchaseInwardLineId`.
- PO receipt, inward creation, stock increment, stock reservation, allocation receipt, and downstream store routing now succeed inside one transaction.

What is still missing:

- Serial-specific validation and stronger downstream serial custody are still incomplete.
- The route is much safer now, but some surrounding downstream flows still use simpler document-level patterns than the standalone tracker.

Impact:

- Operational purchase receipt parity is now high, with only follow-on traceability hardening left.

Status:

- `Mostly complete`

## Medium Gaps

### 5. Transaction coverage is present, but not broad enough yet

Current PM state:

- Mongo `startSession` and `withTransaction` are already used in several important flows.

What is still missing:

- Not all multi-step inventory operations are transaction-protected.
- Some routing, dispatch, and stock-side transitions still depend on multi-document updates without a unified transaction boundary, even though routing logic is now stricter.

Impact:

- Integrity has improved, but there is still risk of partial application on failure in a few high-impact paths.

Status:

- `Partially complete`

### 6. RBAC is improved, but not yet fully standardized

Current PM state:

- `requireAnyRole` is used broadly across the main inventory mutation routes.

What is still missing:

- The module still mixes newer standardized guards with older route patterns and aliases.
- Full route-by-route authorization verification has not yet been completed across every inventory endpoint.
- PM now intentionally extends tracker behavior by allowing Store Manager to route submitted MR lines to Purchase, but this policy should still be reviewed route-by-route so it stays deliberate and consistent.

Impact:

- Access control is much stronger than before, but the module is not yet fully hardened and normalized.

Status:

- `Mostly complete`

### 7. Master-data and admin UX parity is still thinner than the original

Current PM state:

- Core master-data flows exist for classifications, items, vendors, locations, imports, and vendor-SKU mappings.

What is still missing:

- Vendor SKU mapping capability exists at API level, but the admin UX depth is still lighter than the standalone tracker.
- Some richer maintenance workflows from the original tracker still have shallower UI support in PM.

Impact:

- Admin functionality is present, but still not as polished or complete as the source system.

Status:

- `Partially complete`

## Closed Since The Earlier Gap Review

These earlier gaps are now materially closed or greatly reduced:

- Purchase planning is no longer a placeholder.
- Shortage amendment logic now exists.
- `PurchasePlanLine` now exists.
- `PurchaseOrderLineAllocation` now exists.
- `ItemVendorSku` model and APIs exist.
- Transaction support is no longer absent; it now exists in several important flows.
- Audit logging is no longer just a stub; it now covers many core actions.
- Store confirmation, dispatch creation, and dispatch acknowledgement now have dedicated audit snapshots.
- `purchaseInwardLineId` is no longer absent from schema.
- Serial number storage and serial-aware history are now present.
- Purchase inward receipt is now transaction-safe.
- Purchase inward auto-routing now assigns real `purchaseInwardLineId` values.
- Purchase receipt allocation updates are now based on true allocation pending quantities.
- Browser `alert()` usage has been removed from the inventory frontend in favor of reusable in-app notifications.

## Practical Conclusion

The PM inventory module is now a real and substantial replica of the standalone tracker.

The biggest remaining work is no longer broad feature creation. It is now the last 4-8% of hardening and fidelity work:

1. Expand audit coverage so all important inventory mutations have consistent before/after logging.
2. Strengthen full serial custody and serial validation across downstream flows.
3. Finish standardizing RBAC and cleanup around older alias/legacy route patterns.
4. Continue extending transaction coverage to the remaining multi-document inventory mutations.

## Current Best Description

The PM inventory module is now:

- a `strong functional replica`
- a `mostly complete workflow port`
- `not yet a perfect 1:1 structural and traceability replica`
