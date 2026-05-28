const { getRedisClient } = require('/shared');

const TTL_SEC = Math.max(
  3600,
  Number(process.env.ORG_EVENT_IDEMPOTENCY_TTL_SEC || 86400)
);

function orgEventIdempotencyKey(eventId) {
  const id = String(eventId || '').trim();
  if (!id) return '';
  return `org:acl:event:${id}`;
}

/**
 * @returns {Promise<boolean>} true nếu event đã xử lý (skip)
 */
async function isDuplicateOrgEvent(eventId) {
  const key = orgEventIdempotencyKey(eventId);
  if (!key) return false;
  const redis = getRedisClient();
  if (!redis) return false;
  const res = await redis.set(key, '1', 'EX', TTL_SEC, 'NX');
  return res !== 'OK';
}

module.exports = {
  orgEventIdempotencyKey,
  isDuplicateOrgEvent,
  ORG_EVENT_IDEMPOTENCY_TTL_SEC: TTL_SEC,
};
