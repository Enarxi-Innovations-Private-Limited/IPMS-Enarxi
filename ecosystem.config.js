const path = require('path');

const ROOT = __dirname;
const BOM_ROOT = path.join(ROOT, 'server', 'BOM');

module.exports = {
  apps: [
    {
      name: 'ipms-backend',
      script: './server/server.js',
      cwd: ROOT,
      autorestart: true,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        BOM_URL: 'http://127.0.0.1:8000',
      },
    },
    {
      name: 'ipms-bom',
      script: './venv/bin/uvicorn',
      interpreter: 'none',
      args: 'app.main:app --host 127.0.0.1 --port 8000',
      cwd: BOM_ROOT,
      autorestart: true,
      time: true,
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
      },
    },
  ],
};
