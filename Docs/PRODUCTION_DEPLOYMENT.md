# Production Deployment

## PM2

```bash
pm2 start ecosystem.config.js
pm2 restart ipms-backend
pm2 restart ipms-bom
pm2 logs ipms-backend
pm2 logs ipms-bom
pm2 save
pm2 startup
```

## NGINX

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/IPMS-Enarxi/client/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:5000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 50M;
}
```

## Deployment Steps

1. Back up current NGINX config, PM2 process list, and deployed app directory.
2. Pull the latest repo code on the VPS.
3. Copy `.env.example` to `.env` and fill production values.
4. Install server dependencies: `npm install --omit=dev` in the project root.
5. Install client dependencies and build: `cd client && npm install && npm run build`.
6. Create Python virtual environment under `server/BOM/venv`.
7. Install BOM requirements and Playwright browser dependencies.
8. Start PM2 services with `ecosystem.config.js`.
9. Verify:
   - `curl http://127.0.0.1:5000/api/test`
   - `curl http://127.0.0.1:8000/health`
10. Point NGINX to `client/dist` and proxy `/api`, then reload NGINX.

## Rollback

1. Restore previous NGINX config and reload.
2. Restart the previous PM2 app.
3. Stop `ipms-backend` and `ipms-bom` if needed.
4. Keep the current deployment directory until rollback is confirmed stable.
