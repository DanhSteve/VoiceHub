const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { emitRealtimeEvent } = require('/shared');
const {
  setCachedUnreadCount,
  invalidateUnreadBadgeCache,
} = require('../cache/notificationReadCache');

function buildScopeMongoFilter(scope) {
  const normalized = String(scope || '').trim().toLowerCase();
  if (normalized !== 'personal' && normalized !== 'organization') return null;

  const noOrgId = {
    $or: [
      { 'data.organizationId': { $exists: false } },
      { 'data.organizationId': null },
      { 'data.organizationId': '' },
    ],
  };
  const noWorkspaceId = {
    $or: [
      { 'data.workspaceId': { $exists: false } },
      { 'data.workspaceId': null },
      { 'data.workspaceId': '' },
    ],
  };
  const hasOrgId = {
    'data.organizationId': { $exists: true, $nin: [null, ''] },
  };
  const hasWorkspaceId = {
    'data.workspaceId': { $exists: true, $nin: [null, ''] },
  };

  if (normalized === 'personal') {
    return { $and: [noOrgId, noWorkspaceId] };
  }
  return { $or: [hasOrgId, hasWorkspaceId] };
}

async function countUnreadForScope(userId, scope, organizationId = '') {
  const uid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(String(userId))
    : userId;
  const filter = { userId: uid, isRead: false };
  const parts = [];
  const scopeFilter = buildScopeMongoFilter(scope);
  if (scopeFilter) parts.push(scopeFilter);
  if (scope === 'organization' && organizationId) {
    const oid = String(organizationId);
    parts.push({
      $or: [
        { 'data.organizationId': oid },
        { 'data.workspaceId': oid },
      ],
    });
  }
  if (parts.length === 1) Object.assign(filter, parts[0]);
  else if (parts.length > 1) filter.$and = parts;

  return Notification.countDocuments(filter);
}

/**
 * Push snapshot badge qua socket (wave-3c) — event `notification:unread_updated`.
 * @param {string} userId
 * @param {{ scope: 'personal'|'organization', organizationId?: string }[]} targets
 */
async function emitUnreadSnapshots(userId, targets) {
  const uid = String(userId || '').trim();
  if (!uid || !Array.isArray(targets) || !targets.length) return;

  const seen = new Set();
  for (const t of targets) {
    const scope = t?.scope === 'organization' ? 'organization' : 'personal';
    const organizationId =
      scope === 'organization' ? String(t?.organizationId || '').trim() : '';
    const key = `${scope}:${organizationId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    await invalidateUnreadBadgeCache(uid, scope, organizationId);
    const count = await countUnreadForScope(uid, scope, organizationId);
    await setCachedUnreadCount(uid, scope, organizationId, count);

    await emitRealtimeEvent({
      event: 'notification:unread_updated',
      userId: uid,
      payload: {
        scope,
        ...(organizationId ? { organizationId } : {}),
        count,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

function targetsFromNotificationDoc(notification) {
  const targets = [{ scope: 'personal' }];
  const orgFromData =
    notification?.data?.organizationId || notification?.data?.workspaceId;
  if (orgFromData) {
    targets.push({ scope: 'organization', organizationId: String(orgFromData) });
  }
  return targets;
}

module.exports = {
  emitUnreadSnapshots,
  targetsFromNotificationDoc,
  countUnreadForScope,
};
