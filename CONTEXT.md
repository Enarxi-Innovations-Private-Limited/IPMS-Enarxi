# Agent Context Brief

## What I Need To Know Right Now
- Enforced strict Super Admin authority over `COMPLETED` project status in `server/server.js`:
  1. `PUT /api/projects/:projectId` and `PUT /api/projects/:projectId/status` redirect any Manager/Engineer completion attempt to `WAITING_APPROVAL`.
  2. Non-super-admins cannot directly mark projects as `COMPLETED`.
  3. `ManagerProjectsPage.jsx` UI status select now lists `Request Closure (Submit to Admin)` and notifies the manager when an approval request is dispatched.

## Recent Gotchas
- Previously `PUT /api/projects/:projectId` allowed managers to bypass `WAITING_APPROVAL` and directly mark projects `COMPLETED`.

## Active Assumptions
- Only Super Admins can transition projects to `COMPLETED` or reopen `COMPLETED` projects.

## Carry-Forward
- Backend & Manager frontend routes have been aligned to enforce approval flow.

## Next Step
Verify from a Manager account that selecting "Request Closure" submits the project for Super Admin approval without directly completing it.
