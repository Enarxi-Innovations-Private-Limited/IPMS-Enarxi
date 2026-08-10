# Agent Context Brief

## What I Need To Know Right Now
- Branch `Inventory-setup` now includes two pushed cleanup commits: `e7154f7` for repo hygiene and `e1f4fc4` restoring `server/taskTemplates.js`.
- `.gitignore` now explicitly ignores `.temp/`, `.env.save`, and `client/.env`; `client/.env` is no longer tracked in Git.
- Production VPS was cleaned manually without `git pull` because `/home/enarxi-staging/IPMS-Enarxi` is still diverged from origin and contains manual changes.
- PM2 services are currently healthy on production: `ipms-backend` on `127.0.0.1:5000` and `ipms-preview-bom` on `127.0.0.1:8100`.
- The live repo cleanup moved unused root files and utility scripts into `.temp/`, but `server/taskTemplates.js` had to be restored because `server/server.js` imports it.

## Recent Gotchas
- `server/taskTemplates.js` is a runtime dependency; moving it breaks backend startup with `Cannot find module './taskTemplates'`.
- The production checkout should not be updated with `git pull` until its manual drift (`robu.py`, `ecosystem.production.config.js`, spreadsheet edits) is reconciled.

## Active Assumptions
- Root `inventoryRoutes.js`, `Modelfile`, `.env.save`, and the remaining moved server utility scripts are not part of live runtime paths.
- The current branch strategy is still ad hoc; remote branches available are `main`, `dev`, `gantt`, and `Inventory-setup`, with no dedicated `production` branch yet.

## Carry-Forward
- If repo cleanup continues, verify each moved script with `rg` before removing it from tracked history.
- Next product-facing validation should cover the dashboard PDF changes still sitting unstaged in `client/src/components/dashboard/ProductionDashboard.jsx`.
