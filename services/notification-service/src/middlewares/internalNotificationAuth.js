/**
 * POST tạo notification từ webhook / service nội bộ — chỉ dùng NOTIFICATION_INTERNAL_TOKEN
 * (không fallback sang GATEWAY_INTERNAL_TOKEN để tách ranh giới bảo mật).
 */
function internalNotificationAuth(req, res, next) {
  const expected = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();
  if (!expected) {
    return res.status(503).json({
      success: false,
      message: 'Internal notification auth not configured',
    });
  }
  const got = String(
    req.headers['x-internal-notification-token'] || req.headers['x-internal-token'] || ''
  ).trim();
  if (got !== expected) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }
  return next();
}

module.exports = internalNotificationAuth;
