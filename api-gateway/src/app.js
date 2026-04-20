const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { services } = require('./config/services');
require('dotenv').config();

const app = express();

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.GATEWAY_RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.path.startsWith('/api'),
});
app.use(apiLimiter);
const VOICE_SIGNAL_PATH = process.env.VOICE_SIGNAL_PATH || '/voice-socket';

const isProd = process.env.NODE_ENV === 'production';
const corsAllowList = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim())
  .filter(Boolean);

// Middleware — production: chỉ origin trong whitelist; dev: cho phép không có Origin (mobile/curl)
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (corsAllowList.includes(origin)) return callback(null, true);
      if (!isProd) return callback(null, true);
      return callback(new Error('CORS blocked'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })
);
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));

// Proxy Socket.IO polling traffic before auth/permission middlewares.
app.use(
  '/socket.io',
  createProxyMiddleware({
    target: services.socket.url,
    changeOrigin: true,
    ws: false,
    xfwd: true,
    logLevel: 'warn',
    on: {
      error(err, req, res) {
        console.error('[API-Gateway] /socket.io proxy error:', err?.code || err?.message, '| upstream:', services.socket.url);
        if (res && typeof res.writeHead === 'function' && !res.headersSent) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              success: false,
              message: 'Socket service unreachable via gateway',
              hint:
                'Set SOCKET_SERVICE_URL to a reachable URL (Docker: http://socket-service:3017; host: http://127.0.0.1:3017). Or use client VITE_SOCKET_DIRECT_URL=http://127.0.0.1:3017 to bypass gateway for Socket.IO.',
            })
          );
        }
      },
    },
  })
);

// Proxy voice signaling polling (mediasoup signaling via Socket.IO)
app.use(
  VOICE_SIGNAL_PATH,
  createProxyMiddleware({
    target: services.voice.url,
    changeOrigin: true,
    ws: false,
    xfwd: true,
    logLevel: 'warn',
  })
);

// Routes
const routes = require('./routes');
app.use('/', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  if (err && (err.message === 'CORS blocked' || String(err.message || '').includes('CORS'))) {
    return res.status(403).json({
      success: false,
      message: 'Not allowed by CORS',
    });
  }
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

module.exports = app;




