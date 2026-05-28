const { getRedisClient } = require('/shared');

const TTL_SEC = Math.max(30, Number(process.env.NOTIFICATION_UNREAD_CACHE_TTL_SEC || 120));

function unreadBadgeCacheKey(userId, scope = 'personal', organizationId = '') {
  const uid = String(userId || '').trim();
  if (!uid) return '';
  const sc = scope === 'organization' ? 'organization' : 'personal';
  if (sc === 'organization') {
    const oid = String(organizationId || '').trim();
    return oid ? `notif:unread:${uid}:org:${oid}` : '';
  }
  return `notif:unread:${uid}:personal`;
}

async function getCachedUnreadCount(userId, scope, organizationId) {
  const key = unreadBadgeCacheKey(userId, scope, organizationId);
  if (!key) return null;
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function setCachedUnreadCount(userId, scope, organizationId, count) {
  const key = unreadBadgeCacheKey(userId, scope, organizationId);
  if (!key) return;
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.setex(key, TTL_SEC, String(Math.max(0, Number(count) || 0)));
  } catch {
    /* ignore */
  }
}

async function invalidateUnreadBadgeCache(userId, scope, organizationId) {
  const key = unreadBadgeCacheKey(userId, scope, organizationId);
  if (!key) return;
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch {
    /* ignore */
  }
}

async function invalidateUnreadForOrg(orgId) {
  const redis = getRedisClient();
  const oid = String(orgId || '').trim();
  if (!redis || !oid) return;
  const pattern = `notif:unread:*:org:${oid}`;
  try {
    let scanCursor = '0';
    do {
      const [next, keys] = await redis.scan(scanCursor, 'MATCH', pattern, 'COUNT', 100);
      scanCursor = next;
      if (keys.length) await redis.del(...keys);
    } while (scanCursor !== '0');
  } catch {
    /* ignore */
  }
}

module.exports = {
  unreadBadgeCacheKey,
  getCachedUnreadCount,
  setCachedUnreadCount,
  invalidateUnreadBadgeCache,
  invalidateUnreadForOrg,
};
