# Agent Context Brief

## What I Need To Know Right Now
- PCB production projects use a fixed 10-phase flow.
- Employee/Intern projects page now correctly queries all tasks for the active project via `/api/projects/:projectId/tasks` (since the standard `/api/tasks` endpoint filters out manager-assigned production phase tasks).
- Employee detail view has `ProductionWorkerProjectView` integrated to render allocated stages, approved boards, and input fields to submit completed boards for manager review.

## Recent Gotchas
- Employees/Interns were seeing an empty "My Board Allocations" card because the global tasks list only returned items explicitly assigned to them, excluding manager-assigned production phase tasks. Explicitly querying `/api/projects/:projectId/tasks` resolved this.

## Active Assumptions
- Employees/Interns submit completed board drafts which must be approved by the project manager before advancing stages.

## Carry-Forward
- Ensure that the board completion workflow functions correctly from start (employee submission) to finish (manager approval/rejection).
