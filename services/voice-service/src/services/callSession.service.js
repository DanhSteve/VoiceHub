const axios = require('axios');
const mongoose = require('../db');
const CallSession = require('../models/CallSession');
const { applyCallAction } = require('../call/callFsm');
const { emitRealtimeEvent } = require('/shared/utils/realtime');
const { logger } = require('/shared');

const FRIEND_SERVICE_URL = process.env.FRIEND_SERVICE_URL || 'http://friend-service:3014';
const USER_SERVICE_URL = (process.env.USER_SERVICE_URL || 'http://user-service:3004').replace(/\/+$/, '');
const USER_SERVICE_INTERNAL_TOKEN = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
const CHAT_INTERNAL_TOKEN = String(process.env.CHAT_INTERNAL_TOKEN || '').trim();

/** Luôn ưu tiên gọi thẳng chat-service (S2S), tránh lọt qua gateway JWT. */
function resolveChatServiceBaseUrl() {
  const direct = String(process.env.CHAT_SERVICE_DIRECT_URL || '').trim();
  if (direct) return direct.replace(/\/+$/, '');

  const configured = String(process.env.CHAT_SERVICE_URL || '').trim();
  if (configured) {
    const base = configured.replace(/\/+$/, '');
    if (
      !/:3000$/.test(base) &&
      !base.includes('api-gateway') &&
      !base.includes('voicehub.local')
    ) {
      return base;
    }
  }
  return 'http://chat-service:3006';
}

const CHAT_SERVICE_BASE_URL = resolveChatServiceBaseUrl();

function chatInternalHeaders() {
  return {
    'x-internal-token': CHAT_INTERNAL_TOKEN,
    'x-chat-internal-token': CHAT_INTERNAL_TOKEN,
  };
}
const RING_MS = Math.max(5000, Number(process.env.CALL_RING_TIMEOUT_MS || 45000));

const ringTimers = new Map();

function basePayload(session, extra = {}) {
  return {
    callId: String(session._id),
    roomId: session.roomId,
    fromUserId: session.callerId,
    toUserId: session.calleeId,
    fromDisplayName: String(session.callerDisplayName || extra.fromDisplayName || '').trim(),
    status: session.status,
    media: session.media || 'video',
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

async function fetchUserDisplayName(userId) {
  const uid = String(userId || '').trim();
  if (!uid || !USER_SERVICE_INTERNAL_TOKEN) return '';
  try {
    const resp = await axios.get(
      `${USER_SERVICE_URL}/api/users/internal/profile/${encodeURIComponent(uid)}`,
      {
        headers: { 'x-internal-token': USER_SERVICE_INTERNAL_TOKEN },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    if (resp.status !== 200) return '';
    const u = resp.data?.data ?? resp.data;
    const parts = [u?.lastName, u?.firstName].filter(Boolean).join(' ').trim();
    return String(parts || u?.displayName || u?.username || '').trim();
  } catch (err) {
    logger.warn('[callSession] fetch caller name failed:', err?.message || err);
    return '';
  }
}

async function publishCallLogMessage(session) {
  if (!session?.startedAt || !session?.endedAt) return;
  if (!CHAT_INTERNAL_TOKEN) {
    logger.warn('[callSession] CHAT_INTERNAL_TOKEN missing; skip call log message');
    return;
  }
  const durationSec = Math.max(
    0,
    Math.floor((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
  );
  const body = {
    callerId: String(session.callerId),
    calleeId: String(session.calleeId),
    media: session.media || 'video',
    durationSec,
  };
  const candidates = [
    CHAT_SERVICE_BASE_URL,
    'http://chat-service:3006',
    String(process.env.CHAT_SERVICE_URL || '').replace(/\/+$/, ''),
  ].filter(Boolean);
  const bases = [...new Set(candidates)];

  for (const base of bases) {
    try {
      const resp = await axios.post(`${base}/api/messages/internal/call-log`, body, {
        headers: chatInternalHeaders(),
        timeout: 12000,
        validateStatus: () => true,
      });
      if (resp.status >= 200 && resp.status < 300) {
        logger.info(`[callSession] call log published via ${base} (${durationSec}s)`);
        return;
      }
      logger.warn(
        `[callSession] call log publish HTTP ${resp.status} @ ${base}: ${resp.data?.message || 'unknown'}`
      );
    } catch (err) {
      logger.warn(`[callSession] call log publish failed @ ${base}:`, err?.message || err);
    }
  }
}

async function emitToBoth(eventName, session, extra = {}) {
  const payload = { ...basePayload(session), ...extra };
  const ids = [String(session.callerId), String(session.calleeId)];
  return emitRealtimeEvent({
    event: eventName,
    userIds: ids,
    payload,
  });
}

function clearRingTimer(callId) {
  const key = String(callId);
  const t = ringTimers.get(key);
  if (t) {
    clearTimeout(t);
    ringTimers.delete(key);
  }
}

function scheduleRingTimeout(callId) {
  clearRingTimer(callId);
  const t = setTimeout(() => {
    handleRingTimeout(callId).catch((err) =>
      logger.warn('[callSession] ring timeout handler failed:', err?.message || err)
    );
  }, RING_MS);
  ringTimers.set(String(callId), t);
}

async function handleRingTimeout(callId) {
  ringTimers.delete(String(callId));
  const session = await CallSession.findById(callId);
  if (!session || session.status !== 'ringing') return;

  session.status = 'timeout';
  session.endedAt = new Date();
  session.endedReason = 'timeout';
  await session.save();
  await emitToBoth('call:timeout', session, { endedReason: 'timeout' });
}

async function sweepExpiredRinging() {
  try {
    const now = new Date();
    const stuck = await CallSession.find({
      status: 'ringing',
      expiresAt: { $lt: now },
    })
      .limit(200)
      .select('_id')
      .lean();

    for (const row of stuck) {
      await handleRingTimeout(row._id);
    }
  } catch (err) {
    logger.warn('[callSession] sweep failed:', err?.message || err);
  }
}

async function verifyFriendship(callerId, calleeId, authorizationHeader) {
  const auth = authorizationHeader && String(authorizationHeader).trim();
  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    throw err;
  }
  const url = `${FRIEND_SERVICE_URL.replace(/\/+$/, '')}/api/friends/${encodeURIComponent(
    String(calleeId).trim()
  )}/relationship`;
  const resp = await axios.get(url, {
    headers: { Authorization: auth },
    timeout: 12000,
    validateStatus: () => true,
  });
  if (resp.status === 401) {
    const err = new Error(resp.data?.message || 'Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  if (resp.status >= 500) {
    const err = new Error('Friend service temporarily unavailable');
    err.statusCode = 503;
    throw err;
  }
  const rel = resp.data?.data;
  const st = rel?.status || 'none';
  if (st !== 'accepted') {
    const err = new Error('Chỉ có thể gọi khi đã là bạn bè');
    err.statusCode = 403;
    throw err;
  }
}

async function initiate({ callerId, calleeId, media, authorizationHeader }) {
  const c1 = String(callerId || '').trim();
  const c2 = String(calleeId || '').trim();
  if (!c2) {
    const e = new Error('calleeId là bắt buộc');
    e.statusCode = 400;
    throw e;
  }
  if (c1 === c2) {
    const e = new Error('Không thể gọi chính mình');
    e.statusCode = 400;
    throw e;
  }

  await verifyFriendship(c1, c2, authorizationHeader);

  const existing = await CallSession.findOne({
    status: 'ringing',
    $or: [
      { callerId: c1, calleeId: c2 },
      { callerId: c2, calleeId: c1 },
    ],
  })
    .sort({ createdAt: -1 })
    .lean();

  if (existing) {
    const err = new Error('Đang có cuộc gọi chờ với người này');
    err.statusCode = 409;
    err.existingCallId = String(existing._id);
    throw err;
  }

  const expiresAt = new Date(Date.now() + RING_MS);
  const doc = await CallSession.create({
    callerId: c1,
    calleeId: c2,
    status: 'ringing',
    media: media === 'audio' ? 'audio' : 'video',
    expiresAt,
    roomId: null,
  });
  const roomId = `friend-1on1-${String(doc._id)}`;
  doc.roomId = roomId;
  await doc.save();

  scheduleRingTimeout(doc._id);

  const fromDisplayName = await fetchUserDisplayName(c1);
  if (fromDisplayName) doc.callerDisplayName = fromDisplayName;

  await emitRealtimeEvent({
    event: 'call:invite',
    userId: String(c2),
    payload: basePayload(doc),
  });
  await emitRealtimeEvent({
    event: 'call:ringing',
    userId: String(c1),
    payload: { ...basePayload(doc), role: 'caller' },
  });

  return doc;
}

async function getByIdForUser(callId, userId) {
  const uid = String(userId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(String(callId))) {
    const e = new Error('Invalid call id');
    e.statusCode = 400;
    throw e;
  }
  const doc = await CallSession.findById(callId);
  if (!doc) {
    const e = new Error('Không tìm thấy cuộc gọi');
    e.statusCode = 404;
    throw e;
  }
  if (String(doc.callerId) !== uid && String(doc.calleeId) !== uid) {
    const e = new Error('Forbidden');
    e.statusCode = 403;
    throw e;
  }
  return doc;
}

async function accept(callId, userId) {
  const doc = await getByIdForUser(callId, userId);
  const r = applyCallAction(doc, { action: 'accept', userId: String(userId) });
  if (!r.ok) {
    const e = new Error(r.code === 'terminal_state' ? 'Cuộc gọi đã kết thúc' : 'Không thể chấp nhận cuộc gọi');
    e.statusCode = 400;
    throw e;
  }
  clearRingTimer(doc._id);
  doc.status = r.next;
  doc.startedAt = new Date();
  await doc.save();
  await emitToBoth('call:accepted', doc);
  return doc;
}

async function reject(callId, userId) {
  const doc = await getByIdForUser(callId, userId);
  const r = applyCallAction(doc, { action: 'reject', userId: String(userId) });
  if (!r.ok) {
    const e = new Error(r.code === 'terminal_state' ? 'Cuộc gọi đã kết thúc' : 'Không thể từ chối');
    e.statusCode = 400;
    throw e;
  }
  clearRingTimer(doc._id);
  doc.status = r.next;
  doc.endedAt = new Date();
  doc.endedReason = r.endedReason;
  await doc.save();
  await emitToBoth('call:rejected', doc, { endedReason: r.endedReason });
  return doc;
}

async function cancel(callId, userId) {
  const doc = await getByIdForUser(callId, userId);
  const r = applyCallAction(doc, { action: 'cancel', userId: String(userId) });
  if (!r.ok) {
    const e = new Error(r.code === 'terminal_state' ? 'Cuộc gọi đã kết thúc' : 'Không thể hủy');
    e.statusCode = 400;
    throw e;
  }
  clearRingTimer(doc._id);
  doc.status = r.next;
  doc.endedAt = new Date();
  doc.endedReason = r.endedReason;
  await doc.save();
  await emitToBoth('call:cancelled', doc, { endedReason: r.endedReason });
  return doc;
}

async function end(callId, userId) {
  const doc = await getByIdForUser(callId, userId);
  const r = applyCallAction(doc, { action: 'end', userId: String(userId) });
  if (!r.ok) {
    const e = new Error(r.code === 'terminal_state' ? 'Cuộc gọi đã kết thúc' : 'Chỉ kết thúc khi đang trong cuộc gọi');
    e.statusCode = 400;
    throw e;
  }
  doc.status = r.next;
  doc.endedAt = new Date();
  doc.endedReason = r.endedReason;
  await doc.save();
  await emitToBoth('call:ended', doc, { endedReason: r.endedReason });
  await publishCallLogMessage(doc);
  return doc;
}

function startRingSweepInterval() {
  const ms = Math.max(30000, Number(process.env.CALL_RING_SWEEP_MS || 60000));
  return setInterval(() => {
    sweepExpiredRinging().catch(() => {});
  }, ms);
}

module.exports = {
  initiate,
  accept,
  reject,
  cancel,
  end,
  getByIdForUser,
  sweepExpiredRinging,
  startRingSweepInterval,
  basePayload,
};
