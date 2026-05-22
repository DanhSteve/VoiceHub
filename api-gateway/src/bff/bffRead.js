const { getCachedJson, setCachedJson } = require('./cache');
const { coalesce } = require('./coalesce');

/**
 * Read-through BFF: Redis cache → coalesce in-flight → loader.
 * @template T
 * @param {{ cacheKey: string, coalesceKey?: string, ttlSec: number, loader: () => Promise<T> }} opts
 * @returns {Promise<{ data: T, fromCache: boolean }>}
 */
async function bffCachedRead({ cacheKey, coalesceKey, ttlSec, loader }) {
  const key = String(cacheKey || '').trim();
  const flightKey = String(coalesceKey || cacheKey || '').trim();

  const hit = await getCachedJson(key);
  if (hit != null) {
    return { data: hit, fromCache: true };
  }

  return coalesce(flightKey, async () => {
    const hitAgain = await getCachedJson(key);
    if (hitAgain != null) {
      return { data: hitAgain, fromCache: true };
    }
    const data = await loader();
    await setCachedJson(key, data, ttlSec);
    return { data, fromCache: false };
  });
}

module.exports = { bffCachedRead };
