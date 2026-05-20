const axios = require('axios');
const { isTrustedGatewayForward } = require('/shared/middleware/gatewayTrust');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

exports.protect = async (req, res, next) => {
  try {
    const forwardedId = req.headers['x-user-id'];
    if (forwardedId && isTrustedGatewayForward(req)) {
      const id = String(forwardedId).trim();
      req.user = { id, _id: id, email: req.headers['x-user-email'] || undefined };
      return next();
    }

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    const user = response.data?.data?.user || response.data?.data || response.data?.user;
    if (!user || !(user.id || user._id)) {
      return res.status(401).json({ status: 'fail', message: 'Invalid token' });
    }
    if (!user._id && user.id) user._id = user.id;
    req.user = user;
    next();
  } catch (error) {
    if (error.response?.status === 401) {
      return res.status(401).json({
        status: 'fail',
        message: error.response?.data?.message || 'Invalid token',
      });
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
      return res.status(503).json({
        status: 'fail',
        message: 'Auth service unavailable. Please try again later.',
      });
    }
    return res.status(503).json({
      status: 'fail',
      message: error.response?.data?.message || 'Service temporarily unavailable',
    });
  }
};
