const { getRedisClient } = require('/shared');

const PREFIX = process.env.FRIEND_CHAT_FOCUS_REDIS_PREFIX || 'vh:friend_chat_focus:';

function keyFor(userId) {
  return `${PREFIX}${String(userId)}`;
}

/** Người dùng đang mở giao diện /chat/friends (heartbeat từ client). */
async function isOnFriendChatPage(userId) {
  if (!userId) return false;
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return false;
  }
  if (!redis) return false;
  try {
    const v = await redis.get(keyFor(userId));
    return v === '1';
  } catch {
    return false;
  }
}

module.exports = { isOnFriendChatPage };
