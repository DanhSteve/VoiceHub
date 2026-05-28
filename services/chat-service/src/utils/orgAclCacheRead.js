const { getRedisClient } = require('/shared');
const {
  orgAclCacheKey,
  orgAclCachePattern,
  DEFAULT_ORG_ACL_CACHE_TTL_SEC,
} = require('/shared/cache/orgReadCacheKeys');

const ACL_REDIS_TTL_SEC = Number(process.env.ORG_ACL_CACHE_TTL_SEC || DEFAULT_ORG_ACL_CACHE_TTL_SEC);

function resolveUserIdFromReq(req) {
  const fromUser = req.user?.id || req.user?.userId || req.user?._id;
  const fromHeader = req.headers?.['x-user-id'];
  return String(fromUser || fromHeader || '').trim();
}

/**
 * Đọc ACL org đã cache bởi organization-service (wave-2b).
 * @returns {{ channelIds: string[], permissionsByChannelId: object, scope: object|null }|null}
 */
async function readOrgAclFromRedis(orgId, userId) {
  const redis = getRedisClient();
  const oid = String(orgId || '');
  const uid = String(userId || '');
  if (!redis || !oid || !uid) return null;

  try {
    const raw = await redis.get(orgAclCacheKey(oid, uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.channelIds)) return null;
    return {
      channelIds: parsed.channelIds.map(String),
      permissionsByChannelId:
        parsed.permissionsByChannelId && typeof parsed.permissionsByChannelId === 'object'
          ? parsed.permissionsByChannelId
          : {},
      scope: parsed.scope || null,
    };
  } catch {
    return null;
  }
}

async function writeOrgAclToRedis(orgId, userId, payload) {
  const redis = getRedisClient();
  const oid = String(orgId || '');
  const uid = String(userId || '');
  if (!redis || !oid || !uid || !payload) return;
  try {
    const body = {
      channelIds: Array.isArray(payload.channelIds) ? payload.channelIds.map(String) : [],
      permissionsByChannelId:
        payload.permissionsByChannelId && typeof payload.permissionsByChannelId === 'object'
          ? payload.permissionsByChannelId
          : {},
      scope: payload.scope || null,
    };
    await redis.setex(orgAclCacheKey(oid, uid), Math.max(30, ACL_REDIS_TTL_SEC), JSON.stringify(body));
  } catch {
    /* ignore */
  }
}

async function deleteOrgAclFromRedis(orgId, userId) {
  const redis = getRedisClient();
  const oid = String(orgId || '');
  const uid = String(userId || '');
  if (!redis || !oid || !uid) return;
  try {
    await redis.del(orgAclCacheKey(oid, uid));
  } catch {
    /* ignore */
  }
}

async function purgeOrgAclRedisForOrg(orgId) {
  const redis = getRedisClient();
  const oid = String(orgId || '');
  if (!redis || !oid) return;
  try {
    const pattern = orgAclCachePattern(oid);
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
  readOrgAclFromRedis,
  writeOrgAclToRedis,
  deleteOrgAclFromRedis,
  purgeOrgAclRedisForOrg,
  resolveUserIdFromReq,
};
