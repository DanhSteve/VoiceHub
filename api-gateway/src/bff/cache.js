const Redis = require('ioredis');

let redisClient = null;

function isCacheEnabled() {
  const raw = String(process.env.BFF_CACHE_ENABLED || 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

function connectBffRedis() {
  if (redisClient || !isCacheEnabled()) return redisClient;
  try {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: Number(process.env.REDIS_PORT || 6379),
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 2000)),
    });
    redisClient.on('error', (err) => {
      console.warn('[bff:cache] Redis error:', err.message);
    });
    redisClient.on('connect', () => {
      console.log('[bff:cache] Redis connected');
    });
  } catch (err) {
    console.warn('[bff:cache] Redis init failed:', err.message);
    redisClient = null;
  }
  return redisClient;
}

function getRedis() {
  if (!isCacheEnabled()) return null;
  if (!redisClient) connectBffRedis();
  return redisClient;
}

async function getCachedJson(key) {
  const redis = getRedis();
  if (!redis || !key) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCachedJson(key, value, ttlSec) {
  const redis = getRedis();
  if (!redis || !key) return;
  try {
    const ttl = Math.max(5, Number(ttlSec) || 60);
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch (err) {
    console.warn('[bff:cache] set failed', key, err.message);
  }
}

function bootstrapCacheKey(userId) {
  return `bff:bootstrap:${String(userId || '').trim()}`;
}

function shellCacheKey(userId, orgId) {
  return `bff:shell:${String(userId || '').trim()}:${String(orgId || '').trim()}`;
}

function documentsOverviewCacheKey(userId, orgId) {
  return `bff:documents-overview:${String(userId || '').trim()}:${String(orgId || '').trim()}`;
}

function dashboardSummaryCacheKey(userId) {
  return `bff:dashboard-summary:${String(userId || '').trim()}`;
}

module.exports = {
  connectBffRedis,
  getCachedJson,
  setCachedJson,
  bootstrapCacheKey,
  shellCacheKey,
  documentsOverviewCacheKey,
  dashboardSummaryCacheKey,
  isCacheEnabled,
};
