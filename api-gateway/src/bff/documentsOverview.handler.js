/**
 * Read-through cache cho GET documents-overview (aggregate vẫn ở organization-service).
 */
const { bffCachedRead } = require('./bffRead');
const { documentsOverviewCacheKey } = require('./cache');
const { services, buildTrustedHeaders, fetchJson } = require('./httpDownstream');

const TTL_SEC = Math.min(
  120,
  Math.max(15, parseInt(process.env.BFF_DOCUMENTS_OVERVIEW_CACHE_TTL_SEC || '45', 10) || 45)
);

async function fetchDocumentsOverview(userId, userEmail, orgId) {
  const headers = buildTrustedHeaders(userId, userEmail);
  const url = `${services.organization.url}/api/organizations/${encodeURIComponent(orgId)}/documents-overview`;
  const res = await fetchJson(url, headers, 'documents-overview');
  if (!res.ok) {
    const err = new Error(
      res.data?.message || res.data?.error || 'Documents overview unavailable'
    );
    err.statusCode = res.status || 503;
    throw err;
  }
  return res.data;
}

async function handleDocumentsOverview(req, res) {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    const orgId = req.params?.orgId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!orgId) {
      return res.status(400).json({ success: false, message: 'orgId is required' });
    }

    const cacheKey = documentsOverviewCacheKey(userId, orgId);
    const { data, fromCache } = await bffCachedRead({
      cacheKey,
      coalesceKey: cacheKey,
      ttlSec: TTL_SEC,
      loader: () => fetchDocumentsOverview(userId, req.user?.email, orgId),
    });

    if (fromCache) res.setHeader('X-Bff-Cache', 'HIT');
    return res.json(data);
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[bff:documents-overview] error:', error.message);
    return res.status(status).json({
      status: 'fail',
      success: false,
      message: error.message || 'Documents overview failed',
    });
  }
}

module.exports = { handleDocumentsOverview };
