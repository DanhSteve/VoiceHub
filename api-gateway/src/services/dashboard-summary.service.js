/** @deprecated — dùng `src/bff/dashboardSummary.service.js` */
const { buildDashboardSummary } = require('../bff/dashboardSummary.service');

async function getDashboardSummary(userId, userEmail) {
  return buildDashboardSummary(userId, userEmail);
}

module.exports = { getDashboardSummary };
