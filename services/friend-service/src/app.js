const express = require('express');
const { createCorsMiddleware } = require('/shared/middleware/corsPolicy');

const app = express();

// Tránh 304 + body rỗng — axios mặc định chỉ coi 2xx là success, 304 sẽ reject
app.set('etag', false);

// Middleware
app.use(createCorsMiddleware());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'friend-service' });
});

// Friend routes
const friendRoutes = require('./routes/friend.routes');
app.use('/api/friends', friendRoutes);

module.exports = app;

