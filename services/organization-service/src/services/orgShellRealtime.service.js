const { getRedisClient, emitRealtimeEvent } = require('/shared');
const { orgShellVersionCacheKey } = require('/shared/cache/orgReadCacheKeys');
const Membership = require('../models/Membership');

async function getOrgShellVersion(orgId) {
  const redis = getRedisClient();
  const oid = String(orgId || '').trim();
  if (!redis || !oid) return 1;
  try {
    const raw = await redis.get(orgShellVersionCacheKey(oid));
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

async function bumpOrgShellVersion(orgId) {
  const redis = getRedisClient();
  const oid = String(orgId || '').trim();
  if (!redis || !oid) return 1;
  try {
    return await redis.incr(orgShellVersionCacheKey(oid));
  } catch {
    return Date.now();
  }
}

async function listActiveOrgMemberUserIds(orgId) {
  const oid = String(orgId || '').trim();
  if (!oid) return [];
  const rows = await Membership.find({ organization: oid, status: 'active' })
    .select('user')
    .lean();
  return [...new Set(rows.map((r) => String(r.user)).filter(Boolean))];
}

/**
 * Bump shell version + push `org:shell:updated` tới thành viên org.
 */
async function emitOrgShellUpdated(orgId, { userIds = null } = {}) {
  const oid = String(orgId || '').trim();
  if (!oid) return null;

  const version = await bumpOrgShellVersion(oid);
  let targets = Array.isArray(userIds) ? userIds.map(String).filter(Boolean) : null;
  if (!targets?.length) {
    targets = await listActiveOrgMemberUserIds(oid);
  }
  if (!targets.length) return version;

  await emitRealtimeEvent({
    event: 'org:shell:updated',
    userIds: targets,
    payload: {
      organizationId: oid,
      version,
      timestamp: new Date().toISOString(),
    },
  });

  return version;
}

module.exports = {
  getOrgShellVersion,
  bumpOrgShellVersion,
  emitOrgShellUpdated,
  listActiveOrgMemberUserIds,
};
