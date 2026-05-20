const express = require('express');
const { createCorsMiddleware } = require('/shared/middleware/corsPolicy');
require('dotenv').config();
const { gatewayUserFromTrustedHeaders } = require('/shared/middleware/gatewayTrust');
const internalGatewayAuth = require('/shared/middleware/internalGatewayAuth');

const app = express();

// Middleware
app.use(createCorsMiddleware());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'document-service' });
});

// Document routes
const documentRoutes = require('./routes/document.routes');
const internalDocumentRoutes = require('./routes/internal.document.routes');
app.use('/api/documents', gatewayUserFromTrustedHeaders);
app.use('/api/documents', documentRoutes);
app.use('/internal/documents', internalGatewayAuth, internalDocumentRoutes);

module.exports = app;

