const express = require('express');
const cors = require('cors');

const aiTaskRoutes = require('./routes/aiTask.routes');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'ai-task-service' }));

app.use('/api/ai/tasks', aiTaskRoutes);

module.exports = app;

