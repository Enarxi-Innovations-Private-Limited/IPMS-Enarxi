# IPMS-Enarxi Deployment Guide

## Frontend Deployment (What Actually Works)

The tracker frontend is a **static React build** served by **Nginx**.

Nginx for `tracker.enarxi.com` serves files from:

```
/var/www/tracker.enarxi.com
```

Any frontend changes **must** be deployed to this directory.
Updating any other path will have **no effect**.

---

## Correct Frontend Redeployment Steps

After pulling new frontend code:

```bash
cd client
npm install        # only if dependencies changed
npm run build
```

This generates the production build in:

```
client/dist/
```

### Deploy the build (critical step)

```bash
rm -rf /var/www/tracker.enarxi.com/*
cp -r /root/IPMS-Enarxi/client/dist/* /var/www/tracker.enarxi.com/
```

This:

* Removes the old UI
* Replaces it with the new build
* Immediately updates the site

No PM2 restart required.

---

## Why This Is Required

* Nginx serves **only** what exists in `/var/www/tracker.enarxi.com`
* `npm run build` does **not** update production automatically
* PM2 manages **backend only**, not static files
* DNS routes `tracker.enarxi.com` to this droplet and this directory

---

## Backend Redeployment (for reference)

Only required when backend code changes:

```bash
pm2 restart ipms-backend
```

If environment variables changed:

```bash
pm2 restart ipms-backend --update-env
```

---

## Deployment Rule (memorize this)

> **Frontend changed → rebuild + copy `dist` → Nginx root**
> **Backend changed → PM2 restart**
> **Domain decides which folder matters**

---

This is the exact, minimal, correct method.
Nothing else is needed.
