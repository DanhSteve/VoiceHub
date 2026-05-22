const express = require('express');
const { handleBootstrap } = require('./bootstrap.handler');
const { handleDashboardSummary } = require('./dashboardSummary.handler');
const { handleOrgShell } = require('./orgShell.handler');
const { handleDocumentsOverview } = require('./documentsOverview.handler');

/** BFF không cần permission middleware (bootstrap, dashboard). */
const publicBffRouter = express.Router();
publicBffRouter.get('/api/bootstrap', handleBootstrap);
publicBffRouter.get('/api/dashboard/summary', handleDashboardSummary);

/** BFF org read — sau permission; org-service vẫn kiểm tra membership. */
const orgBffRouter = express.Router();
orgBffRouter.get('/api/organizations/:orgId/shell', handleOrgShell);
orgBffRouter.get('/api/organizations/:orgId/documents-overview', handleDocumentsOverview);

module.exports = { publicBffRouter, orgBffRouter };
