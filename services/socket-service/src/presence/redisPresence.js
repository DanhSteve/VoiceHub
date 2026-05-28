const { getRedisClient } = require('/shared');

const PREFIX = process.env.PRESENCE_REDIS_PREFIX || 'vh:presence:';
const TTL_SEC = Math.max(30, parseInt(process.env.PRESENCE_REDIS_TTL_SEC || '120', 10) || 120);

function keyFor(userId) {
  return `${PREFIX}${String(userId)}`;
}

async function setOnline(userId) {
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return false;
  }
  if (!redis) return false;
  try {
    await redis.setex(keyFor(userId), TTL_SEC, 'online');
    return true;
  } catch (e) {
    console.warn('[presence:redis] setOnline failed', e.message);
    return false;
  }
}

async function refreshTtl(userId) {
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return false;
  }
  if (!redis) return false;
  try {
    const k = keyFor(userId);
    const exists = await redis.exists(k);
    if (exists) await redis.expire(k, TTL_SEC);
    return true;
  } catch (e) {
    return false;
  }
}

async function isOnline(userId) {
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return false;
  }
  if (!redis) return false;
  try {
    const v = await redis.get(keyFor(userId));
    return v === 'online';
  } catch {
    return false;
  }
}

async function clear(userId) {
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return false;
  }
  if (!redis) return false;
  try {
    await redis.del(keyFor(userId));
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  setOnline,
  refreshTtl,
  isOnline,
  clear,
  keyFor,
  TTL_SEC,
};
