const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('/shared/middleware/gatewayTrust');

function headersForOrganizationForward(req) {
  const headers = {};
  const uid = String(req.user?.id || req.user?.userId || req.user?._id || '').trim();
  const gwTok = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (uid && gwTok) {
    Object.assign(headers, buildTrustedGatewayHeaders(uid));
  } else {
    const fx = req.headers['x-user-id'];
    const fgw = String(req.headers['x-gateway-internal-token'] || '').trim();
    if (fx && fgw) {
      headers['x-user-id'] = String(fx).trim();
      headers['x-gateway-internal-token'] = fgw;
      const em = req.headers['x-user-email'];
      if (em) headers['x-user-email'] = em;
    }
  }
  const auth = req.headers?.authorization;
  if (auth) headers.Authorization = auth;
  return headers;
}

async function fetchAccessibleChannelPermissionMatrix(orgId, req) {
  const base = (process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013').replace(
    /\/$/,
    ''
  );
  const url = `${base}/api/organizations/${orgId}/accessible-channel-ids`;
  const { data } = await axios.get(url, {
    headers: headersForOrganizationForward(req),
    timeout: Number(process.env.ORG_ACCESSIBLE_CHANNELS_TIMEOUT_MS || 12000),
  });
  const ids = Array.isArray(data?.data?.channelIds) ? data.data.channelIds.map(String) : [];
  const matrix =
    data?.data?.permissionsByChannelId && typeof data.data.permissionsByChannelId === 'object'
      ? data.data.permissionsByChannelId
      : {};
  return { ids, matrix };
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
};
