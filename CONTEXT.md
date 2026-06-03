# Agent Context Brief
_Rewrite this completely at the end of every session. Max 40 lines._

## What I Need To Know Right Now
- This is the IPMS-Enarxi PNPM workspace with `client` (Vite React) and `server` (Express).
- The latest completed fix is in [SuperUserProjectsPage.jsx](D:/users/hameed/Desktop/Enarxi/Project%20Management/client/src/components/dashboard/SuperUserProjectsPage.jsx).
- `/super` dashboard already linked the Delayed card to `/super/projects?filter=DELAYED`; the bug was on the destination page.
- Delayed projects are defined by the same rule as the backend summary: `deadline < now` and `status !== COMPLETED`.
- The projects page now supports `DELAYED` in both URL-driven state and the visible status dropdown.
- Local validation completed: `pnpm --filter client build` passed, frontend is reachable on `http://127.0.0.1:5173/login`, backend is listening on port `5000`.

## Recent Gotchas
- The project filter originally compared only against `project.status`, so `DELAYED` never matched because it is a derived state, not a stored enum in `Project`.
- Some project memory files are still missing from root: `QUARANTINE.md` and `PROGRESS.md`.

## Active Assumptions
- Overdue projects should be surfaced visually as delayed even when their stored status remains `ACTIVE`, `PLANNING`, or `ON_HOLD`.
- No quarantine restrictions were intentionally omitted; the quarantine registry file simply does not exist yet.

## Carry-Forward
- Stay within the dashboard/projects filter scope unless the human asks for broader project-page cleanup.
- Next manual check is authenticated UI verification of the delayed card flow after login.
