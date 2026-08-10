const path = require('path');

const ROOT = __dirname;
const BOM_ROOT = path.join(ROOT, 'server', 'BOM');

module.exports = {
  apps: [
    {
      name: 'ipms-preview-backend',
      script: './server/server.js',
      cwd: ROOT,
      autorestart: true,
      time: true,
      env: {
        NODE_ENV: 'production',
        PORT: 5100,
        BOM_URL: 'http://127.0.0.1:8100',
      },
    },

    {
      name: 'ipms-preview-bom',
      script: 'xvfb-run',
      interpreter: 'none',
      args: '-a ./venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8100',
      cwd: BOM_ROOT,
      autorestart: true,
      time: true,
    },
  ],
};
