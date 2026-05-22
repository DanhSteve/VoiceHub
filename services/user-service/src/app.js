const express = require('express');
const fs = require('fs');
const { createCorsMiddleware } = require('/shared/middleware/corsPolicy');
const { getCryptoMetrics } = require('/shared');
const { uploadsDir } = require('./config/uploadsPath');

const app = express();
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(createCorsMiddleware());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'user-service' });
});

app.get('/health/crypto', (req, res) => {
  res.json({ status: 'ok', service: 'user-service', crypto: getCryptoMetrics() });
});

// User routes
const userRoutes = require('./routes/user.routes');
app.use('/api/users', userRoutes);

module.exports = app;

