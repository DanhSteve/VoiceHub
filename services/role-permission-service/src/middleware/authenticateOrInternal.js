const { authenticate } = require('/shared/middleware/auth');

/**
 * Gọi nội bộ S2S (chỉ x-gateway-internal-token, không có x-user-id) HOẶC JWT / gateway user forward.
 * Request user qua gateway luôn có x-user-id — không được bỏ qua authenticate.
 */
function authenticateOrInternal(req, res, next) {
  const expected = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  const got = String(req.headers['x-gateway-internal-token'] || '').trim();
  const forwardedUserId = String(req.headers['x-user-id'] || '').trim();
  if (expected && got === expected && !forwardedUserId) {
    return next();
  }
  return authenticate(req, res, next);
}

module.exports = authenticateOrInternal;
