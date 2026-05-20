const express = require('express');
const { createCorsMiddleware } = require('/shared/middleware/corsPolicy');
const gatewayUserMiddleware = require('./middlewares/gatewayUser');
const { mongoose } = require('/shared/config/mongo');
require('./models/CallSession');

const app = express();

// Middleware
app.use(createCorsMiddleware());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(gatewayUserMiddleware);

// Routes
app.get('/health', (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({
    status: mongoOk ? 'ok' : 'degraded',
    service: 'voice-service',
    mongo: {
      readyState: mongoose.connection.readyState,
      ok: mongoOk,
    },
  });
});

// Meeting routes
const meetingRoutes = require('./routes/meeting.routes');
app.use('/api/meetings', meetingRoutes);
app.use('/api/voice', meetingRoutes); // Alias

module.exports = app;

