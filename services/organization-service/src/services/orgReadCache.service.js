const { getRedisClient, logger } = require('/shared');
const { publishOrgEvent, ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
const { emitOrgShellUpdated } = require('./orgShellRealtime.service');
const {
  orgAclCacheKey,
  orgStructureSummaryCacheKey,
  orgAclCachePattern,
  DEFAULT_ORG_ACL_CACHE_TTL_SEC,
  DEFAULT_ORG_STRUCTURE_CACHE_TTL_SEC,
} = require('/shared/cache/orgReadCacheKeys');

const ACL_TTL_SEC = Number(process.env.ORG_ACL_CACHE_TTL_SEC || DEFAULT_ORG_ACL_CACHE_TTL_SEC);
const STRUCTURE_TTL_SEC = Number(
  process.env.ORG_STRUCTURE_CACHE_TTL_SEC || DEFAULT_ORG_STRUCTURE_CACHE_TTL_SEC
);

async function redisGetJson(key) {
  const redis = getRedisClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    logger.warn('[orgReadCache] redisGetJson', { key, message: e.message });
    return null;
  }
}

async function redisSetJson(key, value, ttlSec) {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.setex(key, Math.max(30, ttlSec), JSON.stringify(value));
  } catch (e) {
    logger.warn('[orgReadCache] redisSetJson', { key, message: e.message });
  }
}

function buildStructureSummaryMeta(branches = []) {
  const channelIdsFlat = [];
  let departmentCount = 0;
  let teamCount = 0;
  for (const branch of branches) {
    for (const division of branch?.divisions || []) {
      for (const ch of division?.channels || []) {
        if (ch?._id) channelIdsFlat.push(String(ch._id));
      }
      for (const department of division?.departments || []) {
        departmentCount += 1;
        for (const ch of department?.channels || []) {
          if (ch?._id) channelIdsFlat.push(String(ch._id));
        }
        for (const team of department?.teams || []) {
          teamCount += 1;
          for (const ch of team?.channels || []) {
            if (ch?._id) channelIdsFlat.push(String(ch._id));
          }
        }
      }
    }
  }
  return { departmentCount, teamCount, channelIdsFlat };
}

/**
 * @param {{ branches: unknown[], provisioning: object }} full
 */
function packStructureCache(full) {
  const branches = Array.isArray(full?.branches) ? full.branches : [];
  return {
    branches,
    provisioning: full?.provisioning || null,
    summary: buildStructureSummaryMeta(branches),
  };
}

function unpackStructureCache(cached) {
  if (!cached || !Array.isArray(cached.branches)) return null;
  return {
    branches: cached.branches,
    provisioning: cached.provisioning || {
      status: 'ready',
      startedAt: null,
      completedAt: null,
      error: '',
    },
  };
}

async function getCachedAccessibleChannelData(userId, orgId, access, loader) {
  const uid = String(userId || '');
  const oid = String(orgId || '');
  if (!uid || !oid) return loader(userId, orgId, access);

  const key = orgAclCacheKey(oid, uid);
  const hit = await redisGetJson(key);
  if (hit && Array.isArray(hit.channelIds) && hit.permissionsByChannelId) {
    return hit;
  }

  const data = await loader(userId, orgId, access);
  await redisSetJson(key, data, ACL_TTL_SEC);
  return data;
}

async function getCachedOrganizationStructureData(orgId, loader) {
  const oid = String(orgId || '');
  if (!oid) return loader(orgId);

  const key = orgStructureSummaryCacheKey(oid);
  const hit = await redisGetJson(key);
  const unpacked = unpackStructureCache(hit);
  if (unpacked) return unpacked;

  const data = await loader(orgId);
  await redisSetJson(key, packStructureCache(data), STRUCTURE_TTL_SEC);
  return data;
}

async function invalidateOrgAcl(orgId, userId = null, { eventType } = {}) {
  const redis = getRedisClient();
  if (!redis) return;
  const oid = String(orgId || '');
  if (!oid) return;

  try {
    if (userId) {
      await redis.del(orgAclCacheKey(oid, userId));
    } else {
      const pattern = orgAclCachePattern(oid);
      let scanCursor = '0';
      do {
        const [next, keys] = await redis.scan(scanCursor, 'MATCH', pattern, 'COUNT', 100);
        scanCursor = next;
        if (keys.length) await redis.del(...keys);
      } while (scanCursor !== '0');
    }
  } catch (e) {
    logger.warn('[orgReadCache] invalidateOrgAcl', { orgId: oid, message: e.message });
  }

  const type =
    eventType && String(eventType).trim()
      ? String(eventType).trim()
      : ORG_EVENT_TYPES.ACL_UPDATED;

  publishOrgEvent({
    type,
    organizationId: oid,
    userId: userId ? String(userId) : null,
  }).catch((e) => {
    logger.warn('[orgReadCache] publishOrgEvent', { message: e.message });
  });
}

async function invalidateOrgStructure(orgId) {
  const redis = getRedisClient();
  if (!redis) return;
  const oid = String(orgId || '');
  if (!oid) return;
  try {
    await redis.del(orgStructureSummaryCacheKey(oid));
  } catch (e) {
    logger.warn('[orgReadCache] invalidateOrgStructure', { orgId: oid, message: e.message });
  }
}

/** Xóa structure + toàn bộ ACL org (hoặc một user nếu truyền userId). */
async function invalidateOrgReadCache(
  orgId,
  { userId = null, structure = true, acl = true, eventType, pushShell = true } = {}
) {
  if (structure) await invalidateOrgStructure(orgId);
  if (acl) await invalidateOrgAcl(orgId, userId, { eventType });
  if (pushShell && (structure || acl)) {
    emitOrgShellUpdated(orgId, {
      userIds: userId ? [String(userId)] : null,
    }).catch((e) => {
      logger.warn('[orgReadCache] emitOrgShellUpdated', { message: e.message });
    });
  }
}

module.exports = {
  getCachedAccessibleChannelData,
  getCachedOrganizationStructureData,
  invalidateOrgAcl,
  invalidateOrgStructure,
  invalidateOrgReadCache,
  orgAclCacheKey,
  orgStructureSummaryCacheKey,
};
