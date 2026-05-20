#!/usr/bin/env node
/**
 * Smoke check tĩnh: các file middleware then chốt tồn tại.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'shared/middleware/gatewayTrust.js',
  'shared/middleware/corsPolicy.js',
  'services/user-service/src/routes/user.routes.js',
  'services/notification-service/src/middlewares/internalNotificationAuth.js',
  'docs/security-runbook.md',
];

let failed = false;
for (const rel of required) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    console.error('[security-boundary-check] MISSING:', rel);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
