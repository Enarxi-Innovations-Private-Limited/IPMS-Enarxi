# IPMS-Enarxi Production Deployment

This file describes how to deploy changes to the current production VPS.

For the full command reference with use cases, read:

- `PRODUCTION_OPERATIONS.md`

## Current Live Deployment Design

- Process manager: `systemd`
- Backend service: `ipms-backend`
- BOM service: `ipms-preview-bom`
- Web server: `nginx`
- Live code path: `/home/enarxi-staging/IPMS-Enarxi`
- Static frontend path: `/var/www/tracker.enarxi.com`

## Deployment Rules

- Frontend changed:
  - rebuild frontend
  - copy `client/dist` to `/var/www/tracker.enarxi.com`
  - no backend restart needed

- Backend changed:
  - update code
  - install backend dependencies if needed
  - restart `ipms-backend`

- BOM changed:
  - update code
  - install Python requirements if needed
  - restart `ipms-preview-bom`

- nginx changed:
  - run `nginx -t`
  - reload nginx

## Frontend Deployment

```bash
cd /home/enarxi-staging/IPMS-Enarxi
git pull
cd client
npm install
npm run build
rm -rf /var/www/tracker.enarxi.com/*
cp -r /home/enarxi-staging/IPMS-Enarxi/client/dist/* /var/www/tracker.enarxi.com/
```

Use case:
Deploy React frontend changes to the public site.

## Backend Deployment

```bash
cd /home/enarxi-staging/IPMS-Enarxi
git pull
cd server
npm install
systemctl restart ipms-backend
```

Use case:
Deploy Node backend changes.

## BOM Deployment

```bash
cd /home/enarxi-staging/IPMS-Enarxi
git pull
cd server/BOM
source venv/bin/activate
pip install -r requirements.txt
deactivate
systemctl restart ipms-preview-bom
```

Use case:
Deploy Python BOM service changes.

## Full Deployment

```bash
cd /home/enarxi-staging/IPMS-Enarxi
git pull
cd client
npm install
npm run build
rm -rf /var/www/tracker.enarxi.com/*
cp -r /home/enarxi-staging/IPMS-Enarxi/client/dist/* /var/www/tracker.enarxi.com/
cd /home/enarxi-staging/IPMS-Enarxi/server
npm install
cd /home/enarxi-staging/IPMS-Enarxi/server/BOM
source venv/bin/activate
pip install -r requirements.txt
deactivate
systemctl restart ipms-backend ipms-preview-bom
```

Use case:
Deploy combined frontend, backend, and BOM updates.

## Post-Deploy Verification

```bash
systemctl status ipms-backend ipms-preview-bom
curl -I https://tracker.enarxi.com
curl -I https://tracker.enarxi.com/api/
ss -ltnp | grep 127.0.0.1:5000
ss -ltnp | grep 127.0.0.1:8100
```

Use case:
Confirm services are up, nginx is serving traffic, and the internal listeners are healthy.

## nginx Deploy Verification

```bash
nginx -t
systemctl reload nginx
```

Use case:
Safely apply nginx config changes.

## Do Not Use

```bash
pm2 restart ipms-backend
pm2 restart ipms-bom
```

Use case:
Do not use these for live production. Production is no longer managed by PM2.
