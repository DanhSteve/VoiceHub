/**
 * Gắn signed read URL vào tin file/ảnh khi trả API (DB lưu tên file + fileMeta.storagePath).
 * Cache Redis ngắn hạn theo storagePath để giảm gọi GCS lặp.
 */
const { firebaseStorage, getRedisClient } = require('/shared');
const logger = require('/shared/utils/logger');
const { ttlMsForRetentionContext } = require('../config/fileRetention');

const REDIS_PREFIX = 'chat:signedread:';
/** TTL cache Redis (giây): tối đa 15 phút, tối thiểu 60s */
const MAX_CACHE_SEC = 15 * 60;
const MIN_CACHE_SEC = 60;

function cacheTtlSeconds(ttlMs) {
  const sec = Math.floor(Number(ttlMs) / 1000);
  if (!Number.isFinite(sec) || sec <= 0) return MIN_CACHE_SEC;
  return Math.min(MAX_CACHE_SEC, Math.max(MIN_CACHE_SEC, sec));
}

/**
 * @param {string|null|undefined} storagePath
 */
async function invalidateSignedReadCacheForStoragePath(storagePath) {
  if (!storagePath) return;
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(`${REDIS_PREFIX}${storagePath}`);
  } catch {
    /* ignore */
  }
}

/**
 * @param {object[]} messages - plain objects (sau toClientMessage)
 * @returns {Promise<object[]>}
 */
async function attachSignedReadUrlsToMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  if (!firebaseStorage.isEnabled()) return messages;

  const redis = getRedisClient();
  const started = Date.now();

  const out = await Promise.all(
    messages.map(async (msg) => {
      if (!msg) return msg;
      const mt = msg.messageType;
      if ((mt !== 'image' && mt !== 'file') || !msg.fileMeta?.storagePath) {
        return msg;
      }
      const sp = msg.fileMeta.storagePath;
      const ctx = msg.fileMeta.retentionContext || 'dm';
      const ttlMs = ttlMsForRetentionContext(ctx);

      if (redis) {
        try {
          const cached = await redis.get(`${REDIS_PREFIX}${sp}`);
          if (cached) {
            return { ...msg, content: cached };
          }
        } catch {
          /* miss */
        }
      }

      try {
        const { url } = await firebaseStorage.getSignedReadUrl(sp, ttlMs);
        if (redis && url) {
          try {
            await redis.setex(`${REDIS_PREFIX}${sp}`, cacheTtlSeconds(ttlMs), url);
          } catch {
            /* ignore */
          }
        }
        return { ...msg, content: url };
      } catch (err) {
        logger.warn(`[attachSignedReadUrls] path=${sp}: ${err.message}`);
        return msg;
      }
    })
  );

  const ms = Date.now() - started;
  if (ms > 100) {
    logger.info(`[attachSignedReadUrls] messages=${messages.length} elapsedMs=${ms}`);
  }

  return out;
}

/**
 * @param {object|null|undefined} message
 * @returns {Promise<object|null|undefined>}
 */
async function attachSignedReadUrlToMessage(message) {
  if (!message) return message;
  const [one] = await attachSignedReadUrlsToMessages([message]);
  return one;
}

module.exports = {
  attachSignedReadUrlsToMessages,
  attachSignedReadUrlToMessage,
  invalidateSignedReadCacheForStoragePath,
};
