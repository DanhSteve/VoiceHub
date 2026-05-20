const express = require('express');
const { createCorsMiddleware } = require('/shared/middleware/corsPolicy');
const gatewayUserMiddleware = require('./middlewares/gatewayUser');
const { mongoose } = require('/shared/config/mongo');

const app = express();

// Middleware
app.use(createCorsMiddleware());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(gatewayUserMiddleware);

// Routes
app.get('/health', (req, res) => {
  const mongoOk = mongoose.connection.readyState === 1;
  res.status(mongoOk ? 200 : 503).json({
    status: mongoOk ? 'ok' : 'degraded',
    service: 'task-service',
    mongo: {
      readyState: mongoose.connection.readyState,
      ok: mongoOk,
    },
  });
});

// Task routes
const taskRoutes = require('./routes/task.routes');
app.use('/api/tasks', taskRoutes);
app.use('/api/work', taskRoutes); // Alias

module.exports = app;

