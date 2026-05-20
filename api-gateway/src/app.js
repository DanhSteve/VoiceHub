const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { services } = require('./config/services');
require('dotenv').config();

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.GATEWAY_RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.path.startsWith('/api'),
});
app.use(apiLimiter);
const VOICE_SIGNAL_PATH = process.env.VOICE_SIGNAL_PATH || '/voice-socket';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toOriginMatcher(rule) {
  const normalized = String(rule || '').replace(/\/+$/, '').trim();
  if (!normalized) return null;
  if (normalized === '*') return () => true;
  if (!normalized.includes('*')) {
    return (origin) => origin.replace(/\/+$/, '') === normalized;
  }
  const pattern = '^' + escapeRegExp(normalized).replace(/\\\*/g, '.*') + '$';
  const regex = new RegExp(pattern);
  return (origin) => regex.test(origin.replace(/\/+$/, ''));
}

const isProd = process.env.NODE_ENV === 'production';
const corsAllowList = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim())
  .filter(Boolean);
const corsMatchers = corsAllowList.map(toOriginMatcher).filter(Boolean);

// Middleware — production: chỉ origin trong whitelist; dev: cho phép không có Origin (mobile/curl)
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (corsMatchers.some((match) => match(origin))) return callback(null, true);
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
    /**
     * Express mount `/socket.io` sẽ làm req.url trong middleware chỉ còn `/?EIO=...`
     * nhưng socket-service cần path `/socket.io`.
     */
    pathRewrite: (path) => `/socket.io${path}`,
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
    /**
     * Tương tự `/socket.io`: khi mount theo `VOICE_SIGNAL_PATH`, req.url bị strip prefix.
     */
    pathRewrite: (path) => `${VOICE_SIGNAL_PATH}${path}`,
  })
);

/** Public — phải khai báo trước router + auth để Express 5 không rơi vào 401 (client gọi không có JWT). */
app.get('/api/health/gateway-trust', (req, res) => {
  const configured = Boolean(String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim());
  res.json({
    success: true,
    gatewayTrustConfigured: configured,
    message: configured
      ? 'Gateway trust đã cấu hình (GATEWAY_INTERNAL_TOKEN).'
      : 'API Gateway chưa đặt GATEWAY_INTERNAL_TOKEN — đăng nhập sẽ không ổn định. Thêm biến này vào api-gateway/.env và đồng bộ với các microservice.',
  });
});

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




