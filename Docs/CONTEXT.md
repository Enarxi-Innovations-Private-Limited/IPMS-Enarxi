# Project Context: Project Management (IPMS-Enarxi)

## Overview
This project is a Project Management system with a unified inventory tracking module. It is a replica/port of the standalone `Inventory-tracker` project, integrated into the Enarxi IPMS ecosystem.

## Technology Stack
- **Backend**: Node.js, Express.js, MongoDB (Mongoose)
- **Frontend**: React (served as static build via Nginx)
- **Database**: MongoDB (supporting transactions/sessions)

## Key Workflows
- **Material Request (MR)**: Engineers request items for projects.
- **Routing**: Admins/Store Managers route MR lines to either Store (Stock) or Purchase.
- **Purchase Order (PO)**: Purchase Managers create POs for vendors.
- **Purchase Inward**: Store Managers receive items against POs.
- **Dispatch**: Store Managers dispatch items to project sites.

## Current Focus
- Hardening the inventory lifecycle and closing the functional gap with the original `Inventory-tracker`.
- Maintaining complete state transitions (e.g., Marking POs and PRs as RECEIVED).
- Supporting manual stock reconciliation with auto-approval for Admin roles (Super Admin, Super User).
