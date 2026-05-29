const axios = require('axios');
const { fetchUserProfileByIdInternal } = require('/shared');
const { isOnFriendChatPage } = require('./friendChatFocus');

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!NOTIFICATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: NOTIFICATION_SERVICE_URL');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

const SKIP_MESSAGE_TYPES = new Set(['call_log', 'system']);

function notificationAxiosOpts() {
  const opts = { timeout: 8000, validateStatus: () => true };
  if (NOTIFICATION_INTERNAL_TOKEN) {
    opts.headers = { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN };
  }
  return opts;
}

function resolveParticipantId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && value._id != null) return String(value._id).trim();
  return String(value).trim();
}

function buildDmPreview(message) {
  const mt = String(message?.messageType || 'text');
  if (mt === 'image') return 'Đã gửi một ảnh';
  if (mt === 'file') return 'Đã gửi một tệp';
  if (mt === 'business_card') return 'Đã gửi danh thiếp';
  const text = String(message?.content || '').trim();
  if (!text) return 'Bạn có tin nhắn mới';
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

async function resolveSenderDisplayName(senderId) {
  try {
    const res = await fetchUserProfileByIdInternal(senderId);
    if (res?.status !== 200) return 'Bạn bè';
    const u = res?.data?.data ?? res?.data;
    const parts = [u?.lastName, u?.firstName].filter(Boolean).join(' ').trim();
    const name = String(parts || u?.fullName || u?.displayName || u?.username || '').trim();
    return name || 'Bạn bè';
  } catch {
    return 'Bạn bè';
  }
}

/**
 * Gửi thông báo in-app cho người nhận DM khi họ không ở /chat/friends.
 */
async function maybeNotifyDmReceived(message) {
  const receiverId = resolveParticipantId(message?.receiverId);
  const senderId = resolveParticipantId(message?.senderId);
  if (!receiverId || !senderId) return;

  const messageType = String(message?.messageType || 'text');
  if (SKIP_MESSAGE_TYPES.has(messageType)) return;

  if (await isOnFriendChatPage(receiverId)) return;

  const senderName = await resolveSenderDisplayName(senderId);
  const preview = buildDmPreview(message);
  const messageId = String(message?._id || message?.id || '').trim();
  const actionUrl = `/chat/friends?openDmUserId=${encodeURIComponent(senderId)}`;

  try {
    const res = await axios.post(
      `${NOTIFICATION_SERVICE_URL.replace(/\/$/, '')}/api/notifications`,
      {
        userId: receiverId,
        type: 'message',
        title: `${senderName} gửi tin nhắn`,
        content: preview,
        data: {
          senderId,
          friendId: senderId,
          messageId: messageId || undefined,
          messageType,
        },
        actionUrl,
      },
      notificationAxiosOpts()
    );
    if (res.status < 200 || res.status >= 300) {
      console.warn(
        '[dmPushNotification] notify failed',
        res.status,
        res.data?.message || res.data
      );
    }
  } catch (err) {
    console.warn('[dmPushNotification] notify error:', err.message);
  }
}

module.exports = { maybeNotifyDmReceived };
