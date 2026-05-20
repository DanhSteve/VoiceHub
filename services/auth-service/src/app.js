const express = require('express');
const rateLimit = require('express-rate-limit');
const { createCorsMiddleware } = require('/shared/middleware/corsPolicy');
require('dotenv').config();

const app = express();

// Sau reverse proxy / API Gateway request thường có X-Forwarded-For.
// express-rate-limit v7+ bắt buộc trust proxy khớp, nếu không sẽ ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
function resolveTrustProxy() {
  const v = process.env.TRUST_PROXY;
  if (v === '0' || v === 'false') return false;
  if (v === 'true' || v === '1') return true;
  if (v != null && String(v).trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return 1; // mặc định: một hop (gateway → service)
}
app.set('trust proxy', resolveTrustProxy());

// Middleware
app.use(createCorsMiddleware());

const authRouteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX_PER_MIN || 120),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/auth', authRouteLimiter);

// Body parser với limit và error handling
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    // Lưu raw body nếu cần
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Error handler cho body parser
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON format',
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      message: 'Invalid request body',
    });
  }
  next(err);
});

// Handle request aborted errors
app.use((req, res, next) => {
  req.on('aborted', () => {
    console.log('Request aborted by client');
  });
  req.on('close', () => {
    if (!res.headersSent) {
      console.log('Request closed before response sent');
    }
  });
  next();
});

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'auth-service' });
});

// Email service status endpoint (for debugging)
app.get('/email-status', async (req, res) => {
  const emailService = require('./utils/email');
  const hasUser = !!process.env.EMAIL_USER;
  const hasPassword = !!process.env.EMAIL_PASSWORD;
  const isAvailable = emailService.isAvailable();
  
  let connectionStatus = 'unknown';
  if (isAvailable) {
    try {
      const verified = await emailService.verifyConnection();
      connectionStatus = verified ? 'connected' : 'failed';
    } catch (error) {
      connectionStatus = 'error: ' + error.message;
    }
  }
  
  res.json({
    emailService: {
      available: isAvailable,
      hasUser,
      hasPassword,
      userEmail: hasUser ? process.env.EMAIL_USER : null,
      frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
      connectionStatus,
    },
    instructions: {
      checkLogs: 'Run: docker logs enterprise-auth-service -f',
      checkEmail: 'Check spam folder and wait a few minutes',
      verifyConfig: 'Ensure EMAIL_USER and EMAIL_PASSWORD are set correctly',
    },
  });
});

// Auth routes
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

// Error handler middleware (phải đặt sau routes)
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = app;




