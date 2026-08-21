# Agent Context Brief

## What I Need To Know Right Now
- Created `implementation_plan.md` to implement **Completed Project Task Lock & Reopening Workflow**:
  1. Strictly block task creation (`POST /api/tasks`) on `COMPLETED` projects for Managers.
  2. Disable "+ Add Task" button and show a lock banner in `ManagerProjectsPage.jsx` when project is `COMPLETED`.
  3. Add 1-click **"Reopen Project"** buttons to `SuperUserProjectsPage.jsx` on completed project cards and modal header.
  4. Super Admin reopening transitions status to `ACTIVE`, unlocking task creation for Managers.

## Recent Gotchas
- Previously task creation on a `COMPLETED` project auto-reverted status to `ACTIVE` instead of blocking the Manager.

## Active Assumptions
- Once Super Admin approves closure (`COMPLETED`), task creation is locked until Super Admin explicitly reopens the project.

## Carry-Forward
- Awaiting user approval on `implementation_plan.md`.

## Next Step
Obtain user approval on `implementation_plan.md` and execute the proposed changes.
