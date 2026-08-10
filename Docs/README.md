# IPMS-Enarxi Production Docs

This folder contains the current production-facing documentation for the IPMS-Enarxi VPS.

## Read This First

- `PRODUCTION_OPERATIONS.md`
  Use this for day-to-day VPS work.
  It contains the actual live service model, exact paths, restart commands, deploy commands, log commands, security commands, and what each command is for.

- `PRODUCTION_DEPLOYMENT.md`
  Use this when deploying frontend, backend, or BOM changes to production.

- `Production.md`
  Use this as the high-level production architecture summary.

- `IPMS_VPS_Security_Hardening_Report_2026-05-22.pdf`
  Formal record of the VPS hardening work completed on May 22, 2026.

## Important Current State

- Production is no longer managed by PM2.
- Live application services are managed by `systemd`.
- Active services:
  - `ipms-backend`
  - `ipms-preview-bom`
- Public web is served by `nginx`.
- Frontend static files are served from:
  - `/var/www/tracker.enarxi.com`
- Live app code runs from:
  - `/home/enarxi-staging/IPMS-Enarxi`

## Do Not Use

- `pm2 restart ipms-backend`
- `pm2 restart ipms-bom`
- old docs that assume `/root/IPMS-Enarxi` is the active runtime path

Use `systemctl` commands from `PRODUCTION_OPERATIONS.md` instead.
