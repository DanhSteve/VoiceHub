const { bffCachedRead } = require('./bffRead');
const { bootstrapCacheKey } = require('./cache');
const { buildBootstrap } = require('./bootstrap.service');

const TTL_SEC = Math.min(
  120,
  Math.max(15, parseInt(process.env.BFF_BOOTSTRAP_CACHE_TTL_SEC || '45', 10) || 45)
);

async function handleBootstrap(req, res) {
  try {
    const userId = req.user?.id || req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const cacheKey = bootstrapCacheKey(userId);
    const { data, fromCache } = await bffCachedRead({
      cacheKey,
      coalesceKey: cacheKey,
      ttlSec: TTL_SEC,
      loader: () => buildBootstrap(userId, req.user?.email),
    });

    if (fromCache) res.setHeader('X-Bff-Cache', 'HIT');
    return res.json({ success: true, data });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('[bff:bootstrap] error:', error.message);
    return res.status(status).json({
      success: false,
      message: error.message || 'Bootstrap failed',
    });
  }
}

module.exports = { handleBootstrap };
