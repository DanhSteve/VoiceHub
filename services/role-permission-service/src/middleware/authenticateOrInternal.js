const { authenticate } = require('/shared/middleware/auth');

/**
 * Cho phép JWT người dùng HOẶC gọi nội bộ từ gateway (x-gateway-internal-token).
 */
function authenticateOrInternal(req, res, next) {
  const expected = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  const got = String(req.headers['x-gateway-internal-token'] || '').trim();
  if (expected && got === expected) {
    return next();
  }
  return authenticate(req, res, next);
}

module.exports = authenticateOrInternal;
