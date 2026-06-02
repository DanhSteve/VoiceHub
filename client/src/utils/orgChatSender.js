export function senderInitials(message) {
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    const n = u.displayName || u.username || u.fullName || '';
    if (typeof n === 'string' && n.trim()) {
      const p = n.trim().split(/\s+/);
      if (p.length >= 2) return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
      return n.slice(0, 2).toUpperCase();
    }
  }
  return 'TV';
}

export function senderDisplayName(message, isMine, currentUser, fallback) {
  if (isMine) {
    return (
      currentUser?.displayName ||
      currentUser?.fullName ||
      currentUser?.username ||
      currentUser?.email?.split?.('@')?.[0] ||
      fallback
    );
  }
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    return u.displayName || u.username || u.fullName || fallback;
  }
  return fallback;
}

export function senderAvatarUrl(message, isMine, currentUser) {
  if (isMine) {
    return currentUser?.avatar || currentUser?.profile?.avatar || null;
  }
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    return u.avatar || u.profile?.avatar || null;
  }
  return null;
}

export function senderUserId(message, isMine, currentUser) {
  if (isMine) {
    const id = currentUser?.id || currentUser?._id || currentUser?.userId;
    return id != null ? String(id) : null;
  }
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    const id = u._id || u.id || u.userId;
    return id != null ? String(id) : null;
  }
  if (u != null && u !== '') return String(u);
  return null;
}

export function userInitialsFromProfile(user) {
  const name =
    user?.displayName || user?.fullName || user?.username || user?.email?.split?.('@')?.[0] || '';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}
