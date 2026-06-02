const axios = require('axios');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ORGANIZATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ORGANIZATION_SERVICE_URL');

async function assertOrgVoiceChannelAccess({
  userId,
  organizationId,
  channelId,
  authorizationHeader,
}) {
  if (!userId || !organizationId || !channelId) {
    return { allowed: false, reason: 'missing_context' };
  }
  const headers = {};
  if (authorizationHeader) {
    headers.Authorization = authorizationHeader;
  }
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/${encodeURIComponent(organizationId)}/channels/${encodeURIComponent(channelId)}/access`,
      { headers, timeout: 10000, validateStatus: () => true }
    );
    if (res.status !== 200) {
      return { allowed: false, reason: 'upstream_denied' };
    }
    const canRead = res.data?.data?.canRead ?? res.data?.canRead;
    return { allowed: Boolean(canRead) };
  } catch {
    return { allowed: false, reason: 'upstream_error' };
  }
}

module.exports = { assertOrgVoiceChannelAccess };
