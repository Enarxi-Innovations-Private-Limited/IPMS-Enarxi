# IPMS-Enarxi Production Architecture

This is the current live production shape of the project.

## Live Runtime

- OS: Ubuntu VPS
- Process manager: `PM2`
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
  - managed by `pm2`
  - serves backend app on `127.0.0.1:5000`

- `ipms-preview-bom`
  - runs as `enarxi-staging`
  - managed by `pm2`
  - serves BOM app on `127.0.0.1:8100`

- `nginx`
  - runs as `root`
  - managed by `sudo pm2`

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

- PM2 startup units:
  - `/etc/systemd/system/pm2-enarxi-staging.service`
  - `/etc/systemd/system/pm2-root.service`

## Operational Rule

- Frontend changes require:
  - `npm run build`
  - copy `client/dist` into `/var/www/tracker.enarxi.com`

- Backend changes require:
  - `pm2 restart ipms-backend`

- BOM changes require:
  - `pm2 restart ipms-preview-bom`

## Command Reference

For the full production command reference with use cases, read:

- `PRODUCTION_OPERATIONS.md`
