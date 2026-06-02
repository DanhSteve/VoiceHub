const axios = require('axios');

const FRIEND_SERVICE_URL = String(process.env.FRIEND_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!FRIEND_SERVICE_URL) throw new Error('Thiếu biến môi trường: FRIEND_SERVICE_URL');

/**
 * Chỉ cho phép gửi DM khi quan hệ accepted (friend-service).
 * @throws {{ statusCode, code, message, blockerId? }}
 */
async function assertDmCanSend({ peerId, authorizationHeader }) {
  const auth = authorizationHeader && String(authorizationHeader).trim();
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    err.code = 'dm_auth_required';
    throw err;
  }

  const fid = String(peerId || '').trim();
  if (!fid) {
    const err = new Error('receiverId is required');
    err.statusCode = 400;
    err.code = 'dm_invalid_peer';
    throw err;
  }

  const url = `${FRIEND_SERVICE_URL}/api/friends/${encodeURIComponent(fid)}/relationship`;
  const resp = await axios.get(url, {
    headers: { Authorization: auth },
    timeout: Number(process.env.FRIEND_RELATIONSHIP_TIMEOUT_MS || 12000),
    validateStatus: () => true,
  });

  if (resp.status === 401) {
    const err = new Error(resp.data?.message || 'Unauthorized');
    err.statusCode = 401;
    err.code = 'dm_auth_required';
    throw err;
  }

  if (resp.status >= 500) {
    const err = new Error('Friend service temporarily unavailable');
    err.statusCode = 503;
    err.code = 'dm_friend_service_unavailable';
    throw err;
  }

  const rel = resp.data?.data;
  const st = rel?.status || 'none';

  if (st === 'accepted') {
    return rel;
  }

  if (st === 'blocked') {
    const err = new Error('Cannot send message to this user');
    err.statusCode = 403;
    err.code = 'dm_blocked';
    err.blockerId = rel?.blockerId ? String(rel.blockerId) : null;
    throw err;
  }

  const err = new Error('Can only message accepted friends');
  err.statusCode = 403;
  err.code = 'dm_not_friends';
  throw err;
}

function dmErrorToJson(err) {
  return {
    success: false,
    message: err.message || 'Forbidden',
    code: err.code || 'dm_forbidden',
    ...(err.blockerId ? { blockerId: err.blockerId } : {}),
  };
}

module.exports = { assertDmCanSend, dmErrorToJson };
