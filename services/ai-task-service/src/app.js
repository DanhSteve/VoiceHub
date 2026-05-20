const express = require('express');
const { createCorsMiddleware } = require('/shared/middleware/corsPolicy');
const { gatewayUserFromTrustedHeaders } = require('/shared/middleware/gatewayTrust');
const internalGatewayAuth = require('/shared/middleware/internalGatewayAuth');

const aiTaskRoutes = require('./routes/aiTask.routes');
const internalAiTaskRoutes = require('./routes/internalAiTask.routes');

const app = express();
app.use(createCorsMiddleware());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'ai-task-service' }));

app.use('/api/ai/tasks', gatewayUserFromTrustedHeaders);
app.use('/api/ai/tasks', aiTaskRoutes);
app.use('/api/ai/tasks/internal', internalGatewayAuth, internalAiTaskRoutes);

module.exports = app;

