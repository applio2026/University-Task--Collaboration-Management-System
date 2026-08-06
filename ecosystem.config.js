// pm2 process definitions for hosting Uni-TCMS from this machine.
//   start:  pm2 start ecosystem.config.js
//   status: pm2 status
//   logs:   pm2 logs
// The backend reads its own backend/.env via dotenv; ports/CORS live there.
const path = require('node:path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'uni-backend',
      cwd: path.join(ROOT, 'backend'),
      script: 'dist/index.js',
      // Restart on crash; back off if it keeps dying instead of hammering.
      exp_backoff_restart_delay: 200,
      max_restarts: 15,
      env: { NODE_ENV: 'production' },
    },
    {
      // pm2's built-in static server. --spa rewrites unknown paths to
      // index.html so client-side routes (e.g. /login, /workspaces/…) work on
      // a hard refresh. Binds 0.0.0.0 so it's reachable on the public IP.
      name: 'uni-frontend',
      script: 'serve',
      env: { PM2_SERVE_PATH: path.join(ROOT, 'frontend', 'dist'), PM2_SERVE_PORT: '8093', PM2_SERVE_SPA: 'true', PM2_SERVE_HOMEPAGE: '/index.html' },
    },
  ],
};
