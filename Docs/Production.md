# IPMS-Enarxi Production Architecture

This is the current live production shape of the project.

## Live Runtime

- OS: Ubuntu VPS
- Process manager: `systemd`
- Reverse proxy and static serving: `nginx`
- Backend runtime: Node.js
- BOM runtime: Python `uvicorn` under `xvfb-run`
- Security controls:
  - `ufw`
  - `fail2ban`
  - `auditd`

## Active Application Services

- `ipms-backend`
  - runs as `enarxi-staging`
  - serves backend app on `127.0.0.1:5000`

- `ipms-preview-bom`
  - runs as `enarxi-staging`
  - serves BOM app on `127.0.0.1:8100`

## Public Entry Points

- `https://tracker.enarxi.com`
  - served by `nginx`
  - static frontend files from `/var/www/tracker.enarxi.com`

- `/api`
  - proxied by `nginx` to `127.0.0.1:5000`

## Live Paths

- Live code:
  - `/home/enarxi-staging/IPMS-Enarxi`

- Frontend publish path:
  - `/var/www/tracker.enarxi.com`

- nginx site config:
  - `/etc/nginx/sites-enabled/enarxi.com`

- systemd units:
  - `/etc/systemd/system/ipms-backend.service`
  - `/etc/systemd/system/ipms-preview-bom.service`

## Operational Rule

- Frontend changes require:
  - `npm run build`
  - copy `client/dist` into `/var/www/tracker.enarxi.com`

- Backend changes require:
  - service restart of `ipms-backend`

- BOM changes require:
  - service restart of `ipms-preview-bom`

## Command Reference

For the full production command reference with use cases, read:

- `PRODUCTION_OPERATIONS.md`
