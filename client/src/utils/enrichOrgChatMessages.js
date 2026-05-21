/**
 * Gắn displayName / avatar vào message.senderId (API chat thường chỉ trả userId).
 */

export function buildSenderLookupFromContacts(chatContacts, currentUser, currentUserId) {
  const map = new Map();
  for (const c of chatContacts || []) {
    const id = String(c?.id || c?._id || '');
    if (!id) continue;
    map.set(id, {
      _id: id,
      displayName: c.name || c.displayName || c.username || '',
      username: c.username || '',
      avatar: c.avatar || null,
      fullName: c.name || c.fullName || '',
    });
  }
  const uid = currentUserId ? String(currentUserId) : '';
  if (uid && currentUser) {
    map.set(uid, {
      _id: uid,
      displayName:
        currentUser.displayName ||
        currentUser.fullName ||
        currentUser.username ||
        currentUser.email?.split?.('@')?.[0] ||
        '',
      username: currentUser.username || '',
      avatar: currentUser.avatar || currentUser.profile?.avatar || null,
      fullName: currentUser.fullName || currentUser.displayName || '',
    });
  }
  return map;
}

function senderIdString(message) {
  const s = message?.senderId;
  if (s && typeof s === 'object') return String(s._id || s.id || '');
  return String(s || '');
}

function hasSenderProfile(message) {
  const s = message?.senderId;
  return Boolean(
    s &&
      typeof s === 'object' &&
      (s.displayName || s.fullName || s.username || s.avatar)
  );
}

export function enrichMessageSender(message, lookup) {
  if (!message || hasSenderProfile(message)) return message;
  const sid = senderIdString(message);
  if (!sid) return message;
  const profile = lookup.get(sid);
  if (!profile) return message;
  return { ...message, senderId: profile };
}

export function enrichOrgChatMessagesWithSenders(messages, lookup) {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => enrichMessageSender(m, lookup));
}

/**
 * @param {object[]} messages
 * @param {{ chatContacts?, currentUser?, currentUserId?, profileCache?: Map, fetchProfile? }} opts
 */
export async function enrichOrgChatMessagesWithProfiles(messages, opts = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const lookup = buildSenderLookupFromContacts(
    opts.chatContacts,
    opts.currentUser,
    opts.currentUserId
  );
  const cache = opts.profileCache;
  if (cache) {
    for (const [k, v] of cache.entries()) {
      if (!lookup.has(k)) lookup.set(k, v);
    }
  }

  const missing = [];
  for (const m of list) {
    if (hasSenderProfile(m)) continue;
    const sid = senderIdString(m);
    if (!sid || lookup.has(sid) || missing.includes(sid)) continue;
    missing.push(sid);
  }

  if (opts.fetchProfile && missing.length) {
    await Promise.all(
      missing.map(async (uid) => {
        try {
          const profile = await opts.fetchProfile(uid);
          if (profile) {
            lookup.set(uid, profile);
            cache?.set(uid, profile);
          }
        } catch {
          /* giữ fallback Thành viên */
        }
      })
    );
  }

  return enrichOrgChatMessagesWithSenders(list, lookup);
}
