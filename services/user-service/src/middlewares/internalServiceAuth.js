/**
 * Xác thực gọi nội bộ (socket-service → PATCH /api/users/internal/status).
 * Header: x-internal-token phải trùng USER_SERVICE_INTERNAL_TOKEN.
 */
function internalServiceAuth(req, res, next) {
  const expected = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
  const got = String(req.headers['x-internal-token'] || '').trim();

  if (!expected) {
    return res.status(503).json({
      success: false,
      message: 'Internal presence not configured on user-service',
    });
  }
  if (!got || got !== expected) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }
  next();
}

module.exports = internalServiceAuth;
