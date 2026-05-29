import api from './api';

/** Event document — lắng nghe ở NotificationsPage để refetch */
export const NOTIFICATIONS_REFRESH_EVENT = 'voicehub:notifications-refresh';

export function emitNotificationsRefresh() {
  try {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * Sau accept/reject kết bạn: server đánh dấu đã đọc thông báo liên quan tới counterpartyId.
 */
export async function markFriendNotificationsResolved(counterpartyId) {
  if (!counterpartyId) return { ok: false };
  try {
    await api.patch('/notifications/read-friend-related', {
      counterpartyId: String(counterpartyId),
    });
    emitNotificationsRefresh();
    return { ok: true };
  } catch (e) {
    console.warn('[notificationSync] markFriendNotificationsResolved', e?.message || e);
    return { ok: false };
  }
}

/**
 * Sau duyệt/từ chối yêu cầu vào phòng voice (từ thông báo hoặc tab thành viên).
 */
export async function markVoiceRoomJoinRequestNotificationsResolved({
  roomId,
  requestId,
  requestUserId,
}) {
  if (!roomId) return { ok: false };
  try {
    await api.patch('/notifications/read-voice-room-join-request', {
      roomId: String(roomId),
      ...(requestId ? { requestId: String(requestId) } : {}),
      ...(requestUserId ? { requestUserId: String(requestUserId) } : {}),
    });
    emitNotificationsRefresh();
    return { ok: true };
  } catch (e) {
    console.warn('[notificationSync] markVoiceRoomJoinRequestNotificationsResolved', e?.message || e);
    return { ok: false };
  }
}
