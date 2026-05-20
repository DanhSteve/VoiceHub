const axios = require('axios');
const { isTrustedGatewayForward } = require('../../../../shared/middleware/gatewayTrust');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3001';

const getHeader = (headers, key) => headers[key] || headers[key.toLowerCase()];

exports.protect = async (req, res, next) => {
  try {
    const forwardedUserId = getHeader(req.headers, 'x-user-id');
    // Chỉ tin x-user-id khi request đi qua API Gateway (x-gateway-internal-token hợp lệ)
    if (forwardedUserId && isTrustedGatewayForward(req)) {
      req.user = {
        id: forwardedUserId,
        userId: forwardedUserId,
        email: getHeader(req.headers, 'x-user-email') || null,
      };
      return next();
    }
    // Có x-user-id nhưng không tin cậy (thiếu/sai GATEWAY_INTERNAL_TOKEN ở service) — không chặn 401;
    // tiếp tục xác thực bằng JWT để khớp với api-gateway đã verify token.

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }

    // Verify token with auth service (timeout tránh treo cả chuỗi search → chat-service 503)
    const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: Number(process.env.AUTH_HTTP_TIMEOUT_MS || 8000),
    });

    const user = response.data?.data?.user || response.data?.user || {};
    req.user = {
      ...user,
      id: user.id || user.userId || user._id,
    };
    next();
  } catch (error) {
    res.status(401).json({ status: 'fail', message: 'Invalid token' });
  }
};

exports.authorize = (roles) => {
  return async (req, res, next) => {
    const Membership = require('../models/Membership');
    const orgId = req.params.orgId || req.params.id;
    const userId = req.user?.id || req.user?._id || req.user?.userId;

    const membership = await Membership.findOne({
      user: userId,
      organization: orgId,
      status: 'active',
    });

    const normalizedRole = membership ? Membership.normalizeRole(membership.role) : null;
    if (!membership || !roles.includes(normalizedRole)) {
      return res.status(403).json({ status: 'fail', message: 'Access denied' });
    }

    req.membership = { ...membership.toObject(), normalizedRole };
    next();
  };
};
