import userService from '../../services/userService';

const unwrapBody = (payload) => payload?.data ?? payload;

function memberUserId(m) {
  const u = m?.user;
  if (u && typeof u === 'object') return String(u._id || u.id || '');
  return String(u || '');
}

/**
 * Membership (org API) → hàng hiển thị có displayName, avatar.
 */
export async function enrichMembershipsForSearch(members) {
  const list = Array.isArray(members)
    ? members.filter((m) => String(m?.status || 'active') === 'active')
    : [];
  const out = [];
  for (const m of list) {
    const uid = memberUserId(m);
    let displayName = uid.slice(-6);
    let avatar = null;
    let username = null;
    if (uid) {
      try {
        const res = await userService.getProfile(uid);
        const u = unwrapBody(res)?.data ?? unwrapBody(res);
        const profile = u?.data ?? u;
        displayName =
          profile?.displayName ||
          profile?.fullName ||
          profile?.username ||
          profile?.email?.split('@')[0] ||
          displayName;
        avatar = profile?.avatar || null;
        username = profile?.username || null;
      } catch {
        /* */
      }
    }
    out.push({
      membershipId: String(m._id),
      userId: uid,
      role: String(m.role || 'member').toLowerCase(),
      displayName,
      username,
      avatar,
      raw: m,
    });
  }
  return out;
}
