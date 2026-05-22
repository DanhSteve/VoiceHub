const { bffCachedRead } = require('./bffRead');
const { shellCacheKey } = require('./cache');
const { services, buildTrustedHeaders, fetchJson, unwrapPayload } = require('./httpDownstream');

const TTL_SEC = Math.min(
  180,
  Math.max(20, parseInt(process.env.BFF_SHELL_CACHE_TTL_SEC || '60', 10) || 60)
);

async function fetchOrgShell(userId, userEmail, orgId) {
  const headers = buildTrustedHeaders(userId, userEmail);
  const url = `${services.organization.url}/api/organizations/${encodeURIComponent(orgId)}/shell`;
  const res = await fetchJson(url, headers, 'org/shell');
  if (!res.ok) {
    const err = new Error(
      res.data?.message || res.data?.error || 'Organization shell unavailable'
    );
    err.statusCode = res.status || 503;
    throw err;
  }
  const body = res.data;
  if (body?.status === 'success' && body.data !== undefined) {
    return body;
  }
  return { status: 'success', data: unwrapPayload(body) };
}

async function handleOrgShell(req, res) {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    const orgId = req.params?.orgId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!orgId) {
      return res.status(400).json({ success: false, message: 'orgId is required' });
    }

    const cacheKey = shellCacheKey(userId, orgId);
    const { data, fromCache } = await bffCachedRead({
      cacheKey,
      coalesceKey: cacheKey,
      ttlSec: TTL_SEC,
      loader: () => fetchOrgShell(userId, req.user?.email, orgId),
    });

    if (fromCache) res.setHeader('X-Bff-Cache', 'HIT');
    return res.json(data);
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[bff:orgShell] error:', error.message);
    return res.status(status).json({
      status: 'fail',
      success: false,
      message: error.message || 'Org shell failed',
    });
  }
}

module.exports = { handleOrgShell, fetchOrgShell };
