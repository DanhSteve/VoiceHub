const { bffCachedRead } = require('./bffRead');
const { dashboardSummaryCacheKey } = require('./cache');
const { buildDashboardSummary } = require('./dashboardSummary.service');

const TTL_SEC = Math.min(
  120,
  Math.max(15, parseInt(process.env.BFF_DASHBOARD_CACHE_TTL_SEC || '45', 10) || 45)
);

async function handleDashboardSummary(req, res) {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const cacheKey = dashboardSummaryCacheKey(userId);
    const { data, fromCache } = await bffCachedRead({
      cacheKey,
      coalesceKey: cacheKey,
      ttlSec: TTL_SEC,
      loader: () => buildDashboardSummary(userId, req.user?.email),
    });

    if (fromCache) res.setHeader('X-Bff-Cache', 'HIT');
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[bff:dashboard] error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Dashboard summary failed',
    });
  }
}

module.exports = { handleDashboardSummary };
