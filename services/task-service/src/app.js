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

// Task board routes (mount trước /tasks để tránh xung đột /:taskId)
const taskBoardRoutes = require('./routes/taskBoard.routes');
const workspaceTaskBoardRoutes = require('./routes/workspaceTaskBoard.routes');
app.use('/api/tasks/boards', taskBoardRoutes);
app.use('/api/work/boards', taskBoardRoutes);
// REST workspace facade — slug → organizationId, delegate cùng controller board
app.use('/api/workspaces/:workspaceSlug/task-boards', workspaceTaskBoardRoutes);

// Task routes
const taskRoutes = require('./routes/task.routes');
app.use('/api/tasks', taskRoutes);
app.use('/api/work', taskRoutes); // Alias

module.exports = app;

