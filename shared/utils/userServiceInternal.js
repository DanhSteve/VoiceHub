const axios = require('axios');

/**
 * Đọc profile user từ user-service qua route internal (service→service, không JWT).
 * Cần USER_SERVICE_INTERNAL_TOKEN trùng với user-service.
 */
async function fetchUserProfileByIdInternal(userId) {
  const base = String(process.env.USER_SERVICE_URL || 'http://user-service:3004').replace(/\/$/, '');
  const token = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
  if (!token) {
    const err = new Error('USER_SERVICE_INTERNAL_TOKEN is not set');
    err.code = 'NO_INTERNAL_TOKEN';
    throw err;
  }
  return axios.get(`${base}/api/users/internal/profile/${encodeURIComponent(String(userId))}`, {
    headers: { 'x-internal-token': token },
    timeout: 10000,
  });
}

module.exports = { fetchUserProfileByIdInternal };
