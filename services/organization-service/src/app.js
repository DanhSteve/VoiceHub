const express = require('express');
const { createCorsMiddleware } = require('/shared/middleware/corsPolicy');
const { mongoose } = require('/shared/config/mongo');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Middleware
app.use(createCorsMiddleware());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'organization-service',
    mongoReadyState: mongoose.connection?.readyState,
  });
});

const organizationRoutes = require('./routes/organizationRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const memberRoutes = require('./routes/memberRoutes');
const teamRoutes = require('./routes/teamRoutes');
const channelRoutes = require('./routes/channelRoutes');
const hierarchyRoutes = require('./routes/hierarchyRoutes');
const internalGatewayAuth = require('/shared/middleware/internalGatewayAuth');
const internalOrganizationRoutes = require('./routes/internalOrganization.routes');

app.use('/api/organizations', organizationRoutes);
app.use('/api/organizations/internal', internalGatewayAuth, internalOrganizationRoutes);
app.use('/api/organizations/:orgId/departments', departmentRoutes);
app.use('/api/organizations/:orgId/members', memberRoutes);
app.use('/api/organizations/:orgId/departments/:deptId/channels', channelRoutes);
// Legacy compatibility while FE migrates from teams -> channels.
app.use('/api/organizations/:orgId/departments/:deptId/teams', teamRoutes);
app.use('/api/organizations/:orgId/hierarchy', hierarchyRoutes);

app.use(errorHandler);

module.exports = app;

