import userService from '../../services/userService';

function unwrap(payload) {
  return payload?.data ?? payload;
}

export function looksLikeEmail(value) {
  const s = String(value || '').trim();
  if (!s || !s.includes('@')) return false;
  const parts = s.split('@');
  return parts.length === 2 && parts[0].length > 0 && parts[1].includes('.');
}

export function extractBusinessCard(message) {
  try {
    const raw = message?.content;
    if (raw && typeof raw === 'object') return { ...raw };
    if (typeof raw === 'string' && raw.trim()) return JSON.parse(raw);
  } catch {
    /* */
  }
  return {};
}

/** Chuẩn hóa field từ JSON đã lưu trong tin nhắn (nhiều tên field legacy). */
export function normalizeBusinessCardFields(card) {
  const userId = String(card?.userId || card?.id || card?.memberId || '').trim();
  const username = String(card?.username || '').trim();
  let fullName = String(card?.fullName || card?.name || '').trim();
  let phone = String(card?.phone || card?.phoneNumber || card?.mobile || card?.tel || '').trim();
  let email = String(card?.email || card?.mail || '').trim();

  if (!fullName && username) fullName = username;
  if (email && !looksLikeEmail(email) && (email === fullName || email === username)) {
    email = '';
  }

  return { userId, fullName, phone, email, username };
}

export function applyProfileToBusinessCard(fields, profile) {
  if (!profile) return fields;
  const p = profile?.data ?? profile;
  const phone =
    fields.phone ||
    String(p?.phone || p?.phoneNumber || p?.mobile || '').trim();
  let email = fields.email || String(p?.email || '').trim();
  if (email && !looksLikeEmail(email)) email = '';
  const fullName =
    fields.fullName ||
    String(p?.displayName || p?.fullName || p?.username || '').trim() ||
    fields.fullName;
  return { ...fields, fullName, phone, email };
}

/**
 * Bổ sung SĐT/email từ user-service khi tin danh thiếp lưu snapshot thiếu dữ liệu.
 */
export async function enrichMessagesBusinessCards(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const profileCache = new Map();

  const userIds = [
    ...new Set(
      list
        .filter((m) => String(m?.messageType || '').toLowerCase() === 'business_card')
        .map((m) => normalizeBusinessCardFields(extractBusinessCard(m)).userId)
        .filter((id) => id && !id.startsWith('manual-'))
    ),
  ];

  await Promise.all(
    userIds.map(async (uid) => {
      try {
        const res = await userService.getProfile(uid);
        const body = unwrap(res);
        const profile = body?.data ?? body;
        if (profile) profileCache.set(uid, profile);
      } catch {
        /* profile không load được — giữ snapshot trong tin */
      }
    })
  );

  return list.map((message) => {
    if (String(message?.messageType || '').toLowerCase() !== 'business_card') {
      return message;
    }
    const fields = normalizeBusinessCardFields(extractBusinessCard(message));
    const needsProfile =
      fields.userId &&
      (!fields.phone || !fields.email || (fields.email && !looksLikeEmail(fields.email)));
    const enriched = needsProfile
      ? applyProfileToBusinessCard(fields, profileCache.get(fields.userId))
      : fields;
    return { ...message, __businessCard: enriched };
  });
}

export function getBusinessCardFields(message) {
  if (message?.__businessCard) return message.__businessCard;
  return normalizeBusinessCardFields(extractBusinessCard(message));
}

/** Một danh thiếp — bổ sung SĐT/email từ user-service khi snapshot thiếu. */
export async function resolveBusinessCardFields(message) {
  const fields = getBusinessCardFields(message);
  const uid = fields.userId;
  if (!uid || uid.startsWith('manual-')) return fields;
  if (fields.phone && fields.email && looksLikeEmail(fields.email)) return fields;
  try {
    const res = await userService.getProfile(uid);
    const body = unwrap(res);
    const profile = body?.data ?? body;
    return applyProfileToBusinessCard(fields, profile);
  } catch {
    return fields;
  }
}

export function formatBusinessCardLine(t, fields) {
  const fullName = String(fields?.fullName || '—').trim() || '—';
  const phone = String(fields?.phone || '').trim() || '-';
  const email = String(fields?.email || '').trim();
  const emailDisplay = email && looksLikeEmail(email) ? email : '-';
  const key = 'organizations.contactCard';
  if (t) {
    const line = t(key, { fullName, phone, email: emailDisplay });
    if (line && line !== key) {
      return String(line).replace(/\s*\n+\s*/g, ' · ');
    }
  }
  return `👤 Danh thiếp · Tên: ${fullName} · SĐT: ${phone} · Email: ${emailDisplay}`;
}
