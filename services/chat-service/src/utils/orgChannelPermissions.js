const {
  resolveOrgChannelAccess,
  resolveUserIdFromReq,
} = require('../services/orgAccessReadModel');

async function fetchAccessibleChannelPermissionMatrix(orgId, req) {
  const access = await resolveOrgChannelAccess(orgId, req);
  return {
    ids: access.channelIds,
    matrix: access.permissionsByChannelId,
  };
}

async function assertCanWriteInOrgChannel(orgId, roomId, req) {
  if (!orgId || !roomId) return;
  const { matrix } = await fetchAccessibleChannelPermissionMatrix(orgId, req);
  const perms = matrix[String(roomId)] || {};
  if (!Boolean(perms.canWrite)) {
    const err = new Error('Bạn không có quyền chat trong kênh này');
    err.statusCode = 403;
    throw err;
  }
}

module.exports = {
  fetchAccessibleChannelPermissionMatrix,
  assertCanWriteInOrgChannel,
  resolveUserIdFromReq,
};
