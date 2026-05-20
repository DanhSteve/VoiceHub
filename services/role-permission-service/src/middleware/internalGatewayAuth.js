/**
 * Chỉ cho phép API Gateway (hoặc service có cùng GATEWAY_INTERNAL_TOKEN) gọi nội bộ.
 */
function internalGatewayAuth(req, res, next) {
  const expected = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (!expected) {
    return res.status(503).json({
      success: false,
      message: 'GATEWAY_INTERNAL_TOKEN is not configured',
    });
  }
  const got = String(req.headers['x-gateway-internal-token'] || '').trim();
  if (got !== expected) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }
  return next();
}

module.exports = internalGatewayAuth;
