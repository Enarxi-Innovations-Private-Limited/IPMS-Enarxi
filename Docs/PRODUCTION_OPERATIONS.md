# IPMS-Enarxi Production Operations

This is the live production command reference for the current VPS.

## Production Model

- Process manager: `PM2`
- App PM2 user: `enarxi-staging`
- Root PM2 user: `root`
- Public web server: `nginx`
- Backend service: `ipms-backend`
- BOM service: `ipms-preview-bom`
- Host user for app runtime: `enarxi-staging`
- Live app path: `/home/enarxi-staging/IPMS-Enarxi`
- Static frontend path: `/var/www/tracker.enarxi.com`
- Backend bind: `127.0.0.1:5000`
- BOM bind: `127.0.0.1:8100`

## Important Rule

Use PM2 for live production operations.

- `pm2` under `enarxi-staging` manages `ipms-backend` and `ipms-preview-bom`
- `sudo pm2` under `root` manages `nginx`

## Connect to the Server

```bash
ssh ipms
```

Use case:
Open a shell on the production VPS using the configured SSH host alias.

## Switch to Root

```bash
sudo -i
```

Use case:
Run root-owned PM2 and nginx commands.

## Go to the Live Project Directory

```bash
cd /home/enarxi-staging/IPMS-Enarxi
```

Use case:
Work against the current live deployment path.

## Service Status Commands

### Check backend and BOM

```bash
pm2 list
```

Use case:
See whether `ipms-backend` and `ipms-preview-bom` are online.

### Check nginx

```bash
sudo pm2 list
```

Use case:
Confirm the root PM2 context is running `nginx`.

### Check PM2 startup services

```bash
sudo systemctl status pm2-enarxi-staging pm2-root
```

Use case:
Verify PM2 will resurrect services on reboot.

## Restart Commands

### Restart backend only

```bash
pm2 restart ipms-backend
```

### Restart BOM only

```bash
pm2 restart ipms-preview-bom
```

### Restart both app services

```bash
pm2 restart ipms-backend
pm2 restart ipms-preview-bom
```

### Restart nginx

```bash
sudo nginx -t
sudo pm2 restart nginx
```

## Log Commands

### Backend logs

```bash
pm2 logs ipms-backend --lines 100 --nostream
```

### Follow backend logs

```bash
pm2 logs ipms-backend
```

### BOM logs

```bash
pm2 logs ipms-preview-bom --lines 100 --nostream
```

### Follow BOM logs

```bash
pm2 logs ipms-preview-bom
```

### Nginx logs

```bash
sudo tail -n 100 /var/log/nginx/access.log
sudo tail -n 100 /var/log/nginx/error.log
```

## Deploy Commands

### Pull code updates in the live path

```bash
cd /home/enarxi-staging/IPMS-Enarxi
git pull
```

### Install backend dependencies

```bash
cd /home/enarxi-staging/IPMS-Enarxi/server
npm install
```

### Install frontend dependencies

```bash
cd /home/enarxi-staging/IPMS-Enarxi/client
npm install
```

### Build frontend for production

```bash
cd /home/enarxi-staging/IPMS-Enarxi/client
npm run build
```

### Publish the built frontend

```bash
rm -rf /var/www/tracker.enarxi.com/*
cp -r /home/enarxi-staging/IPMS-Enarxi/client/dist/* /var/www/tracker.enarxi.com/
```

### Restart services after deploy

```bash
pm2 restart ipms-backend
pm2 restart ipms-preview-bom
sudo pm2 restart nginx
```

## Common Deploy Flows

### Frontend-only change

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
Deploy UI changes only. No PM2 app restart is required for static frontend changes.

### Backend-only change

```bash
cd /home/enarxi-staging/IPMS-Enarxi
git pull
cd server
npm install
pm2 restart ipms-backend
```

### BOM-only change

```bash
cd /home/enarxi-staging/IPMS-Enarxi
git pull
cd server/BOM
source venv/bin/activate
pip install -r requirements.txt
deactivate
pm2 restart ipms-preview-bom
```

### Full stack change

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
pm2 restart ipms-backend
pm2 restart ipms-preview-bom
sudo pm2 restart nginx
```

## Health Check Commands

```bash
ss -ltnp | grep 127.0.0.1:5000
ss -ltnp | grep 127.0.0.1:8100
curl -I http://127.0.0.1:5000
curl -I http://127.0.0.1:8100/docs
curl -I https://tracker.enarxi.com
curl -I https://tracker.enarxi.com/api/
```

## File and Config Locations

### Live code

```bash
/home/enarxi-staging/IPMS-Enarxi
```

### Frontend static root

```bash
/var/www/tracker.enarxi.com
```

### nginx site config

```bash
/etc/nginx/sites-enabled/enarxi.com
```

### App PM2 startup unit

```bash
/etc/systemd/system/pm2-enarxi-staging.service
```

### Root PM2 startup unit

```bash
/etc/systemd/system/pm2-root.service
```

## Commands You Should Not Use for Live Production

```bash
systemctl restart ipms-backend
systemctl restart ipms-preview-bom
systemctl restart nginx
```

Use case:
Do not use these for normal live service management. The live stack is now controlled through PM2.
