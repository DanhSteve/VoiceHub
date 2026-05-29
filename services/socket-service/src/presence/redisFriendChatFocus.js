const { getRedisClient } = require('/shared');

const PREFIX = process.env.FRIEND_CHAT_FOCUS_REDIS_PREFIX || 'vh:friend_chat_focus:';
const TTL_SEC = Math.max(30, parseInt(process.env.FRIEND_CHAT_FOCUS_TTL_SEC || '90', 10) || 90);

function keyFor(userId) {
  return `${PREFIX}${String(userId)}`;
}

async function setActive(userId) {
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return false;
  }
  if (!redis) return false;
  try {
    await redis.setex(keyFor(userId), TTL_SEC, '1');
    return true;
  } catch (e) {
    console.warn('[friendChatFocus:redis] setActive failed', e.message);
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
  } catch {
    return false;
  }
}

module.exports = {
  setActive,
  refreshTtl,
  clear,
  keyFor,
  TTL_SEC,
};
