const axios = require('axios');
const { resolveFrontendUrl } = require('/shared');

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();
const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || 'http://user-service:3002')
  .trim()
  .replace(/\/+$/, '');
const USER_SERVICE_INTERNAL_TOKEN = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();

function notificationAxiosOpts() {
  const opts = { timeout: 8000 };
  if (NOTIFICATION_INTERNAL_TOKEN) {
    opts.headers = { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN };
  }
  return opts;
}

function userServiceAxiosOpts() {
  const opts = { timeout: 8000 };
  if (USER_SERVICE_INTERNAL_TOKEN) {
    opts.headers = { 'x-internal-token': USER_SERVICE_INTERNAL_TOKEN };
  }
  return opts;
}

async function notifyVoiceRoomInvite({ userId, roomId, hostName, frontendUrl }) {
  if (!NOTIFICATION_SERVICE_URL || !userId) return;
  const base = frontendUrl || process.env.FRONTEND_URL || 'https://voicehub.local';
  const actionUrl = `${String(base).replace(/\/+$/, '')}/voice/${encodeURIComponent(roomId)}?join=1`;
  try {
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications`,
      {
        userId: String(userId),
        type: 'meeting',
        title: 'Lời mời vào phòng thoại',
        content: `${hostName || 'Ai đó'} mời bạn vào phòng ${roomId}.`,
        data: {
          kind: 'voice_room_invite',
          roomId: String(roomId),
          hostName: hostName || '',
        },
        actionUrl,
      },
      notificationAxiosOpts()
    );
  } catch (e) {
    console.warn('[voiceRoomNotify] invite notification failed:', e.message);
  }
}

async function notifyJoinRequestToHost({
  hostUserId,
  roomId,
  requesterName,
  requestId,
  requestUserId,
  frontendUrl,
}) {
  if (!NOTIFICATION_SERVICE_URL || !hostUserId) return;
  const base = frontendUrl || process.env.FRONTEND_URL || 'https://voicehub.local';
  const actionUrl = `${String(base).replace(/\/+$/, '')}/voice/${encodeURIComponent(roomId)}`;
  try {
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications`,
      {
        userId: String(hostUserId),
        type: 'meeting',
        title: 'Yêu cầu vào phòng thoại',
        content: `${requesterName || 'Người dùng'} xin vào phòng ${roomId}.`,
        data: {
          kind: 'voice_room_join_request',
          roomId: String(roomId),
          requestId: requestId ? String(requestId) : undefined,
          requestUserId: requestUserId ? String(requestUserId) : undefined,
          requesterName: requesterName || '',
        },
        actionUrl,
      },
      notificationAxiosOpts()
    );
  } catch (e) {
    console.warn('[voiceRoomNotify] join request notification failed:', e.message);
  }
}

async function markJoinRequestNotificationsResolved({
  hostUserId,
  roomId,
  requestId,
  requestUserId,
}) {
  if (!NOTIFICATION_SERVICE_URL || !hostUserId || !roomId) return;
  try {
    await axios.patch(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/internal/read-voice-room-join-request`,
      {
        userId: String(hostUserId),
        roomId: String(roomId),
        requestId: requestId ? String(requestId) : undefined,
        requestUserId: requestUserId ? String(requestUserId) : undefined,
      },
      notificationAxiosOpts()
    );
  } catch (e) {
    console.warn('[voiceRoomNotify] mark join request notifications failed:', e.message);
  }
}

async function lookupUserIdByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return null;
  try {
    const res = await axios.get(`${USER_SERVICE_URL}/api/users/internal/search`, {
      params: { q: normalized, limit: 5 },
      ...userServiceAxiosOpts(),
    });
    const users = res.data?.data?.users || res.data?.users || [];
    const list = Array.isArray(users) ? users : [];
    const match = list.find((u) => {
      const em = String(u?.email || '').trim().toLowerCase();
      return em === normalized;
    });
    const uid = match?.userId || match?._id || match?.id;
    return uid ? String(uid) : null;
  } catch (e) {
    console.warn('[voiceRoomNotify] email lookup failed:', e.message);
    return null;
  }
}

async function sendVoiceRoomInviteEmail({ email, roomId, hostName, frontendUrl }) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return { sent: false, reason: 'invalid_email' };

  const authUrl = String(process.env.AUTH_SERVICE_URL || 'http://auth-service:3001')
    .trim()
    .replace(/\/+$/, '');
  const token = String(process.env.GATEWAY_INTERNAL_TOKEN || process.env.AUTH_INTERNAL_TOKEN || '').trim();
  const base = frontendUrl || process.env.FRONTEND_URL || 'https://voicehub.local';
  const inviteUrl = `${String(base).replace(/\/+$/, '')}/voice/${encodeURIComponent(roomId)}?join=1`;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['x-gateway-internal-token'] = token;
    await axios.post(
      `${authUrl}/api/auth/internal/voice-room-invite`,
      {
        email: normalized,
        roomId: String(roomId),
        hostName: hostName || '',
        inviteUrl,
      },
      { headers, timeout: 12000 }
    );
    return { sent: true };
  } catch (e) {
    console.warn('[voiceRoomNotify] voice room invite email failed:', e.message);
    return { sent: false, reason: e.message };
  }
}

module.exports = {
  notifyVoiceRoomInvite,
  notifyJoinRequestToHost,
  markJoinRequestNotificationsResolved,
  lookupUserIdByEmail,
  sendVoiceRoomInviteEmail,
  resolveFrontendUrl,
};
