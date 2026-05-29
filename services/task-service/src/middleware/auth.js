const axios = require('axios');

const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!AUTH_SERVICE_URL) throw new Error('Thiếu biến môi trường: AUTH_SERVICE_URL');

exports.protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ status: 'fail', message: 'Not authenticated' });
    }

    const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    req.user = response.data.data.user;
    next();
  } catch (error) {
    res.status(401).json({ status: 'fail', message: 'Invalid token' });
  }
};
