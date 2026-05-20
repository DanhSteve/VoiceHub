const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware');
const permissionMiddleware = require('../middlewares/permission.middleware');
const proxyMiddleware = require('../middlewares/proxy.middleware');

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Gateway is running',
    timestamp: new Date().toISOString(),
  });
});

router.get('/metrics', (req, res) => {
  res.json({
    success: true,
    service: 'api-gateway',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/health/gateway-trust được đăng ký trong app.js (trước auth) — tránh 401 khi client chưa có JWT.

// Apply authentication middleware cho tất cả routes (trừ public routes)
router.use(authMiddleware);

// Apply permission middleware để kiểm tra quyền truy cập
router.use(permissionMiddleware);

// Apply proxy middleware cho tất cả routes
// Dùng router.use() với path pattern để match tất cả routes
// Lưu ý: Với Express 5, cần đảm bảo proxy middleware được gọi đúng cách
router.use((req, res, next) => {
  console.log(`[API-Gateway] Router.use() middleware called for ${req.method} ${req.path}`);
  return proxyMiddleware(req, res, next);
});

module.exports = router;


