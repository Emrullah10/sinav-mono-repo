/**
 * Root PM2 ecosystem for local npm run dev:backend.
 * CommonJS (.cjs) on purpose: the monorepo sets "type": "module", so
 * per-service ecosystem.config.js files throw "module is not defined".
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const servicesDir = path.join(root, 'services');

const appFor = (name) => {
  const cwd = path.join(servicesDir, name);
  if (!fs.existsSync(path.join(cwd, 'main.js'))) return null;
  return {
    name,
    script: 'main.js',
    cwd,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    kill_timeout: 30000,
    env: {
      NODE_ENV: 'development',
    },
  };
};

const names = fs
  .readdirSync(servicesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort((a, b) => a.localeCompare(b));

// Gateway last: it snapshots Redis routes at boot. If it comes up while
 // downstream services are still registering, authenticated calls 404 as
 // ROUTE_NOT_FOUND until the next refresh.
const gateway = 'sinav-web-gateway';
const ordered = [...names.filter((n) => n !== gateway), gateway];

module.exports = {
  apps: ordered.map(appFor).filter(Boolean),
};
