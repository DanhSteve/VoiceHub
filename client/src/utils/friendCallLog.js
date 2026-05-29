/**
 * Parse payload tin nhắn call_log (DM 1-1).
 * @param {string|object} raw
 */
export function parseFriendCallLog(raw) {
  if (!raw) return null;
  try {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || typeof o !== 'object') return null;
    const media = o.media === 'audio' ? 'audio' : 'video';
    const callerId = String(o.callerId || '').trim();
    const calleeId = String(o.calleeId || '').trim();
    if (!callerId || !calleeId) return null;
    return {
      media,
      callerId,
      calleeId,
      durationSec: Math.max(0, Number(o.durationSec) || 0),
    };
  } catch {
    return null;
  }
}

/**
 * @param {number} totalSec
 * @param {(key: string, vars?: object) => string} t
 */
export function formatFriendCallDuration(totalSec, t) {
  const sec = Math.max(0, Math.floor(Number(totalSec) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return t('friendChat.callLogDurationHms', { h, m, s });
  }
  if (m > 0) {
    return t('friendChat.callLogDurationMs', { m, s });
  }
  return t('friendChat.callLogDurationS', { s });
}

/**
 * @param {string} currentUserId
 * @param {{ callerId: string, calleeId: string }} log
 */
export function peerIdForCallLogCallback(currentUserId, log) {
  const me = String(currentUserId || '').trim();
  if (!me || !log) return '';
  if (me === String(log.callerId)) return String(log.calleeId);
  if (me === String(log.calleeId)) return String(log.callerId);
  return '';
}
