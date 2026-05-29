function matchFriendUser(friendsRows, userId) {
  const uid = String(userId || '').trim();
  if (!uid || !Array.isArray(friendsRows)) return null;

  for (const f of friendsRows) {
    const u = f?.friendId && typeof f.friendId === 'object' ? f.friendId : f;
    const candidates = [
      u?._id,
      u?.userId,
      u?.id,
      typeof f?.friendId === 'string' || typeof f?.friendId === 'number' ? f.friendId : null,
    ]
      .filter((x) => x != null && typeof x !== 'object')
      .map(String);

    if (candidates.includes(uid)) {
      return u;
    }
  }
  return null;
}

/**
 * Tìm tên hiển thị bạn bè theo userId từ danh sách GET /friends.
 * @param {Array} friendsRows
 * @param {string} userId
 */
export function resolveFriendDisplayNameFromList(friendsRows, userId) {
  const u = matchFriendUser(friendsRows, userId);
  return u ? String(u.displayName || u.username || '').trim() : '';
}

/**
 * @param {Array} friendsRows
 * @param {string} userId
 * @returns {{ name: string, avatar: string|null }}
 */
export function resolveFriendProfileFromList(friendsRows, userId) {
  const u = matchFriendUser(friendsRows, userId);
  if (!u) return { name: '', avatar: null };
  return {
    name: String(u.displayName || u.username || '').trim(),
    avatar: u.avatar || null,
  };
}

/** Socket/voice đôi khi gửi email làm displayName — ưu tiên tên từ session/profile. */
export function looksLikeEmailLabel(value) {
  const s = String(value || '').trim();
  return s.includes('@') && !/\s/.test(s);
}

export function pickPeerDisplayLabel(socketLabel, sessionLabel, fallback = '') {
  const fromSession = String(sessionLabel || '').trim();
  const fromSocket = String(socketLabel || '').trim();
  if (fromSession && (!fromSocket || looksLikeEmailLabel(fromSocket))) return fromSession;
  if (fromSocket && !looksLikeEmailLabel(fromSocket)) return fromSocket;
  return fromSession || fromSocket || fallback;
}
