const express = require('express');
const { createCorsMiddleware } = require('/shared/middleware/corsPolicy');

const app = express();

// Middleware
app.use(createCorsMiddleware());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'role-permission-service' });
});

// Role routes
const roleRoutes = require('./routes/role.routes');
app.use('/api/roles', roleRoutes);
const internalRoleRoutes = require('./routes/internalRole.routes');
app.use('/api/internal/roles', internalRoleRoutes);

// Permission routes
const permissionRoutes = require('./routes/permission.routes');
app.use('/api/permissions', permissionRoutes);

module.exports = app;

