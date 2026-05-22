# IPMS-Enarxi Production Operations

This is the live production command reference for the current VPS.

## Production Model

- Process manager: `systemd`
- Public web server: `nginx`
- Backend service: `ipms-backend`
- BOM service: `ipms-preview-bom`
- Host user for app runtime: `enarxi-staging`
- Live app path: `/home/enarxi-staging/IPMS-Enarxi`
- Static frontend path: `/var/www/tracker.enarxi.com`
- Backend bind: `127.0.0.1:5000`
- BOM bind: `127.0.0.1:8100`

## Important Rule

Do not use PM2 for live production operations.

`pm2 list` may still exist on the server, but the live services are now managed by `systemd`.

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
Run production administration commands that require root privileges.

## Go to the Live Project Directory

```bash
cd /home/enarxi-staging/IPMS-Enarxi
```

Use case:
Work against the current live deployment path.

## Service Status Commands

### Check the live app services

```bash
systemctl status ipms-backend ipms-preview-bom
```

Use case:
See whether the backend and BOM services are running, failed, or restarting.

### Quick active/inactive check

```bash
systemctl is-active ipms-backend ipms-preview-bom
```

Use case:
Fast health check without full logs.

### Check nginx status

```bash
systemctl status nginx
```

Use case:
Confirm the public web server is running correctly.

### Check security services

```bash
systemctl status fail2ban auditd ssh mosquitto
```

Use case:
Verify the hardening-related services are healthy.

## Restart Commands

### Restart backend only

```bash
systemctl restart ipms-backend
```

Use case:
Use this after changing Node/Express backend code or backend environment behavior.

### Restart BOM service only

```bash
systemctl restart ipms-preview-bom
```

Use case:
Use this after changing Python BOM automation code or its dependencies.

### Restart both live app services

```bash
systemctl restart ipms-backend ipms-preview-bom
```

Use case:
Use this after changes that affect both backend and BOM integration.

### Reload nginx safely

```bash
nginx -t && systemctl reload nginx
```

Use case:
Use this after nginx config changes. It validates config before applying it.

### Restart nginx fully

```bash
systemctl restart nginx
```

Use case:
Use this only if reload is not enough or nginx is stuck.

## Log Commands

### Backend logs

```bash
journalctl -u ipms-backend -n 100 --no-pager
```

Use case:
See the latest backend logs after deploy, restart, or failure.

### BOM logs

```bash
journalctl -u ipms-preview-bom -n 100 --no-pager
```

Use case:
See the latest BOM service logs after deploy, restart, or automation failure.

### Live follow backend logs

```bash
journalctl -u ipms-backend -f
```

Use case:
Watch backend logs in real time while testing requests.

### Live follow BOM logs

```bash
journalctl -u ipms-preview-bom -f
```

Use case:
Watch BOM logs in real time while testing procurement/BOM flows.

### Nginx access log

```bash
tail -n 100 /var/log/nginx/access.log
```

Use case:
Inspect recent HTTP traffic reaching nginx.

### Nginx error log

```bash
tail -n 100 /var/log/nginx/error.log
```

Use case:
Inspect web server failures, proxy issues, and config problems.

## Deploy Commands

### Pull code updates in the live path

```bash
cd /home/enarxi-staging/IPMS-Enarxi
git pull
```

Use case:
Bring the latest committed code into the live deployment directory.

### Install backend dependencies

```bash
cd /home/enarxi-staging/IPMS-Enarxi/server
npm install
```

Use case:
Run this after backend dependency changes in `server/package.json`.

### Install frontend dependencies

```bash
cd /home/enarxi-staging/IPMS-Enarxi/client
npm install
```

Use case:
Run this after frontend dependency changes in `client/package.json`.

### Build frontend for production

```bash
cd /home/enarxi-staging/IPMS-Enarxi/client
npm run build
```

Use case:
Compile the React frontend into a static production build.

### Publish the built frontend

```bash
rm -rf /var/www/tracker.enarxi.com/*
cp -r /home/enarxi-staging/IPMS-Enarxi/client/dist/* /var/www/tracker.enarxi.com/
```

Use case:
Replace the live static frontend files after a successful frontend build.

### Restart backend after backend deploy

```bash
systemctl restart ipms-backend
```

Use case:
Apply backend code changes after pulling code.

### Restart BOM after BOM deploy

```bash
systemctl restart ipms-preview-bom
```

Use case:
Apply BOM service code changes after pulling code.

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
Deploy UI changes only. No app service restart is required for static frontend changes.

### Backend-only change

```bash
cd /home/enarxi-staging/IPMS-Enarxi
git pull
cd server
npm install
systemctl restart ipms-backend
```

Use case:
Deploy Node/Express backend changes.

### BOM-only change

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
Deploy Python BOM automation changes or Python dependency changes.

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
systemctl restart ipms-backend ipms-preview-bom
```

Use case:
Deploy frontend, backend, and BOM updates together.

## Health Check Commands

### Check backend listener

```bash
ss -ltnp | grep 127.0.0.1:5000
```

Use case:
Confirm the backend is listening on the expected localhost port.

### Check BOM listener

```bash
ss -ltnp | grep 127.0.0.1:8100
```

Use case:
Confirm the BOM service is listening on the expected localhost port.

### Check Mosquitto listener

```bash
ss -ltnp | grep 127.0.0.1:1883
```

Use case:
Confirm MQTT is localhost-only and not publicly exposed.

### Test backend locally from the VPS

```bash
curl -I http://127.0.0.1:5000
```

Use case:
Quick reachability test for the backend process.

### Test BOM locally from the VPS

```bash
curl -I http://127.0.0.1:8100/docs
```

Use case:
Quick reachability test for the BOM service.

### Test the public site

```bash
curl -I https://tracker.enarxi.com
```

Use case:
Check that the public frontend is reachable and HTTPS is working.

### Test the public API path

```bash
curl -I https://tracker.enarxi.com/api/
```

Use case:
Check that nginx is proxying API requests to the backend.

## Security Commands

### Show firewall rules

```bash
ufw status verbose
```

Use case:
Review the live firewall policy and confirm SSH/web access rules.

### Check Fail2Ban jail status

```bash
fail2ban-client status sshd
```

Use case:
See failed attempts, banned IPs, and active SSH protection.

### Check effective SSH policy

```bash
sshd -T | grep passwordauthentication
```

Use case:
Verify that SSH password authentication is disabled in the effective config.

### Show public listeners

```bash
ss -tulpen
```

Use case:
Audit exposed services and confirm only intended ports are public.

## Reboot Commands

### Reboot immediately

```bash
reboot
```

Use case:
Restart the VPS, for example after kernel updates.

### Reboot with delay

```bash
shutdown -r +1 "Scheduled reboot"
```

Use case:
Schedule a reboot with a short delay so you can warn users first.

## File and Config Locations

### Live code

```bash
/home/enarxi-staging/IPMS-Enarxi
```

Use case:
Current active project path used by `systemd`.

### Frontend static root

```bash
/var/www/tracker.enarxi.com
```

Use case:
Current public document root served by nginx.

### nginx site config

```bash
/etc/nginx/sites-enabled/enarxi.com
```

Use case:
Main nginx virtual host config for this deployment.

### Backend service unit

```bash
/etc/systemd/system/ipms-backend.service
```

Use case:
`systemd` definition for the Node backend service.

### BOM service unit

```bash
/etc/systemd/system/ipms-preview-bom.service
```

Use case:
`systemd` definition for the BOM Python service.

## If You Change a systemd Service File

```bash
systemctl daemon-reload
systemctl restart ipms-backend ipms-preview-bom
```

Use case:
Reload service definitions after editing unit files, then restart the services.

## If You Change the Environment File

```bash
systemctl restart ipms-backend ipms-preview-bom
```

Use case:
Reload app processes so they pick up new environment values.

## Commands You Should Not Use for Live Production

```bash
pm2 restart ipms-backend
pm2 restart ipms-bom
pm2 save
pm2 startup
```

Use case:
Do not use these for the live server. They belong to the old process model and are no longer the active production control path.
