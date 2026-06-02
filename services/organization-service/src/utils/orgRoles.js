const ROLE_PERMISSION_SERVICE_URL = String(process.env.ROLE_PERMISSION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ROLE_PERMISSION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ROLE_PERMISSION_SERVICE_URL');
const axios = require('axios');

const ROLE_PERMISSION_BASE = String(
  process.env.ROLE_PERMISSION_SERVICE_URL
).replace(/\/$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

function roleInternalHeaders(userId) {
  const h = { 'Content-Type': 'application/json' };
  if (GATEWAY_INTERNAL_TOKEN) h['x-gateway-internal-token'] = GATEWAY_INTERNAL_TOKEN;
  const uid = String(userId || '').trim();
  if (uid) h['x-user-id'] = uid;
  return h;
}

async function fetchUserRolesInOrg(userId, orgId) {
  if (!userId || !orgId) return [];
  const uid = String(userId).trim();
  try {
    const res = await axios.get(
      `${ROLE_PERMISSION_BASE}/api/roles/user/${encodeURIComponent(uid)}/server/${encodeURIComponent(
        String(orgId)
      )}`,
      {
        headers: roleInternalHeaders(uid),
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200 || !Array.isArray(res.data?.data)) return [];
    return res.data.data
      .map((r) => ({
        id: String(r?._id || r?.id || '').trim(),
        name: String(r?.name || '').trim(),
      }))
      .filter((r) => r.id);
  } catch {
    return [];
  }
}

module.exports = {
  fetchUserRolesInOrg,
  roleInternalHeaders,
  ROLE_PERMISSION_BASE,
};
