const axios = require('axios');
const { emitToRoom, emitToUser } = require('./realtimeHub');
const { publishFriendDm } = require('../messaging/rabbitPublisher');
const redisPresence = require('../presence/redisPresence');

// URL nội bộ tới chat-service trong docker-compose
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://chat-service:3006';
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:3004';

function getPresenceInternalToken() {
  return String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
}

const onlineUserSockets = new Map();

/**
 * Đồng bộ presence lên user-service (online / offline).
 * Cần USER_SERVICE_INTERNAL_TOKEN trùng với user-service (docker-compose / .env).
 */
async function syncPresenceUserStatus(userId, status) {
  if (!userId) return false;
  const token = getPresenceInternalToken();
  if (!token) {
    console.warn(
      '[socket-service] syncPresenceUserStatus skipped: USER_SERVICE_INTERNAL_TOKEN is empty. ' +
        'Set the same token as user-service so disconnect → offline in DB works.'
    );
    return false;
  }
  try {
    const url = `${USER_SERVICE_URL.replace(/\/$/, '')}/api/users/internal/status`;
    const res = await axios.patch(
      url,
      { userId: String(userId), status },
      {
        headers: { 'x-internal-token': token },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    if (res.status >= 200 && res.status < 300) {
      console.log(`[socket-service] presence synced: user=${userId} status=${status}`);
      return true;
    }
    console.error(
      `[socket-service] syncPresenceUserStatus ${status} HTTP ${res.status} for ${userId}:`,
      res.data?.message || res.data
    );
    return false;
  } catch (err) {
    console.error(
      `[socket-service] syncPresenceUserStatus ${status} failed for ${userId}:`,
      err.response?.data?.message || err.message
    );
    return false;
  }
}

const normalizeToken = (rawToken) => {
  if (!rawToken) return null;
  let token = String(rawToken).trim();
  if (!token) return null;
  if (token.startsWith('Bearer ')) token = token.slice(7).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  if (!token || token === 'null' || token === 'undefined') return null;
  return token;
};

module.exports = function registerChatNamespace(io) {
  io.on('connection', (socket) => {
    const authUser = socket.data?.user || socket.user || {};
    const userId = authUser.id || authUser.userId || authUser._id;
    console.log('[socket-service] user connected:', userId);

    // Join room theo userId để hỗ trợ DM
    if (userId) {
      const key = String(userId);
      socket.join(`user:${key}`);
      const prevCount = onlineUserSockets.get(key) || 0;
      onlineUserSockets.set(key, prevCount + 1);
      io.emit('user:connected', key);
      io.emit('users:online', Array.from(onlineUserSockets.keys()));
      // Kết nối socket đầu tiên → online trong DB
      if (prevCount === 0) {
        redisPresence.setOnline(key);
        syncPresenceUserStatus(key, 'online');
      }
    }

    // ====== FRIEND DM: gửi tin nhắn ======
    socket.on('friend:send', async ({ receiverId, content, messageType = 'text', replyToMessageId }) => {
      try {
        if (!receiverId || !content) {
          return socket.emit('error', { message: 'receiverId and content are required' });
        }

        let useQueue =
          process.env.FRIEND_DM_USE_QUEUE !== 'false' && Boolean(process.env.RABBITMQ_URL);
        if (replyToMessageId) {
          useQueue = false;
        }

        if (useQueue && userId) {
          const pub = await publishFriendDm({
            senderId: userId,
            receiverId,
            content,
            messageType,
          });
          if (pub.ok) {
            redisPresence.refreshTtl(String(userId));
            return;
          }
          console.warn('[socket-service] friend:send queue publish failed, falling back to HTTP');
        }

        const token = normalizeToken(
          socket.handshake.auth?.token || socket.handshake.headers?.authorization
        );

        const body = { receiverId, content, messageType };
        if (replyToMessageId) body.replyToMessageId = replyToMessageId;

        const resp = await axios.post(
          `${CHAT_SERVICE_URL}/api/messages`,
          body,
          token
            ? { headers: { Authorization: `Bearer ${token}` } }
            : undefined
        );

        const payload = resp?.data || resp;
        const message = payload?.data || payload;

        emitToUser(receiverId, 'friend:new_message', message);
        socket.emit('friend:sent', message);
      } catch (err) {
        console.error('[socket-service] friend:send error', err.message);
        socket.emit('error', {
          message: err.response?.data?.message || err.message || 'Gửi tin nhắn thất bại'
        });
      }
    });

    socket.on('room:join', ({ roomId }) => {
      if (!roomId) return;
      socket.join(roomId);
      socket.emit('room:joined', { roomId });
    });

    socket.on('room:leave', ({ roomId }) => {
      if (!roomId) return;
      socket.leave(roomId);
      socket.emit('room:left', { roomId });
    });

    socket.on('room:send', ({ roomId, event = 'room:new_message', payload = {} }) => {
      if (!roomId) return;
      emitToRoom(roomId, event, {
        ...payload,
        senderId: userId || null,
        sentAt: new Date().toISOString(),
      });
    });

    socket.on('disconnect', async (reason) => {
      if (userId) {
        const key = String(userId);
        const current = onlineUserSockets.get(key) || 0;
        if (current <= 1) {
          onlineUserSockets.delete(key);
          io.emit('user:disconnected', key);
          redisPresence.clear(key);
          await syncPresenceUserStatus(key, 'offline');
        } else {
          onlineUserSockets.set(key, current - 1);
        }
        io.emit('users:online', Array.from(onlineUserSockets.keys()));
      }
      console.log('[socket-service] user disconnected:', userId, 'reason:', reason);
    });
  });
};

