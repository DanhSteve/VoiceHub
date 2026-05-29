const axios = require('axios');
const FriendUnfriendGrace = require('../models/FriendUnfriendGrace');
const { logger, mongo } = require('/shared');
const { mongoose } = mongo;

const CHAT_SERVICE_URL = String(process.env.CHAT_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!CHAT_SERVICE_URL) throw new Error('Thiếu biến môi trường: CHAT_SERVICE_URL');
const CHAT_INTERNAL_TOKEN = process.env.CHAT_INTERNAL_TOKEN || '';

const DEFAULT_GRACE_MS = 12 * 60 * 60 * 1000;

function getGracePeriodMs() {
  const hours = Number(process.env.FRIEND_UNFRIEND_GRACE_HOURS);
  if (Number.isFinite(hours) && hours > 0) return hours * 60 * 60 * 1000;
  const ms = Number(process.env.FRIEND_UNFRIEND_GRACE_MS);
  if (Number.isFinite(ms) && ms > 0) return ms;
  return DEFAULT_GRACE_MS;
}

function toOidString(id) {
  if (id == null) return '';
  return String(id).trim();
}

/** Cặp user cố định (min/max) để tra cứu grace. */
function sortPairIds(userId, friendId) {
  const a = toOidString(userId);
  const b = toOidString(friendId);
  if (!a || !b) return null;
  if (a === b) return null;
  return a < b ? { userIdA: a, userIdB: b } : { userIdA: b, userIdB: a };
}

function pairToObjectIds(pair) {
  if (!pair) return null;
  const toOid = (id) => {
    const s = toOidString(id);
    return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s) : s;
  };
  return { userIdA: toOid(pair.userIdA), userIdB: toOid(pair.userIdB) };
}

async function findActiveGrace(userId, friendId) {
  const pair = sortPairIds(userId, friendId);
  if (!pair) return null;
  const oids = pairToObjectIds(pair);
  const row = await FriendUnfriendGrace.findOne({
    userIdA: oids.userIdA,
    userIdB: oids.userIdB,
    purgeAt: { $gt: new Date() },
  }).lean();
  return row;
}

async function scheduleGrace({ userId, friendId, dissolvedBy, meta = {} }) {
  const pair = sortPairIds(userId, friendId);
  if (!pair) throw new Error('Invalid user pair');

  const now = new Date();
  const purgeAt = new Date(now.getTime() + getGracePeriodMs());
  const oids = pairToObjectIds(pair);
  const dissolvedByOid = (() => {
    const s = toOidString(dissolvedBy);
    return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s) : s;
  })();

  const doc = await FriendUnfriendGrace.findOneAndUpdate(
    { userIdA: oids.userIdA, userIdB: oids.userIdB },
    {
      $set: {
        dissolvedBy: dissolvedByOid,
        dissolvedAt: now,
        purgeAt,
        meta: {
          requestedBy: meta.requestedBy || null,
          acceptedAt: meta.acceptedAt || null,
        },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return doc;
}

/** Kết bạn lại trong thời gian grace — hủy lịch xóa vĩnh viễn, giữ DM. */
async function cancelGraceIfActive(userId, friendId) {
  const pair = sortPairIds(userId, friendId);
  if (!pair) return { cancelled: false };

  const oids = pairToObjectIds(pair);

  const row = await FriendUnfriendGrace.findOneAndDelete({
    userIdA: oids.userIdA,
    userIdB: oids.userIdB,
    purgeAt: { $gt: new Date() },
  });

  if (!row) return { cancelled: false };

  logger.info(`Unfriend grace cancelled (re-friend): ${pair.userIdA} <-> ${pair.userIdB}`);
  return { cancelled: true, purgeAt: row.purgeAt };
}

async function purgeDmMessages(userIdA, userIdB) {
  if (!CHAT_INTERNAL_TOKEN) {
    logger.warn('CHAT_INTERNAL_TOKEN not set; skip DM purge after grace expired');
    return { deletedCount: 0, skipped: true };
  }
  const res = await axios.post(
    `${CHAT_SERVICE_URL}/api/messages/internal/dm/delete-between`,
    { userIdA: String(userIdA), userIdB: String(userIdB) },
    {
      headers: { 'x-internal-token': CHAT_INTERNAL_TOKEN },
      timeout: Number(process.env.FRIEND_DM_PURGE_TIMEOUT_MS || 60000),
    }
  );
  return res.data?.data || { deletedCount: 0 };
}

async function purgeExpiredGraces({ batchSize = 20 } = {}) {
  const now = new Date();
  const due = await FriendUnfriendGrace.find({ purgeAt: { $lte: now } })
    .sort({ purgeAt: 1 })
    .limit(batchSize)
    .lean();

  let purged = 0;
  for (const row of due) {
    try {
      await purgeDmMessages(row.userIdA, row.userIdB);
      await FriendUnfriendGrace.deleteOne({ _id: row._id });
      purged += 1;
      logger.info(`Unfriend grace purged: ${row.userIdA} <-> ${row.userIdB}`);
    } catch (err) {
      logger.warn(
        `Unfriend grace purge failed for ${row.userIdA}/${row.userIdB}:`,
        err.response?.data?.message || err.message
      );
    }
  }
  return { scanned: due.length, purged };
}

function gracePeriodHoursForClient() {
  return Math.round(getGracePeriodMs() / (60 * 60 * 1000));
}

module.exports = {
  getGracePeriodMs,
  gracePeriodHoursForClient,
  pairToObjectIds,
  sortPairIds,
  findActiveGrace,
  scheduleGrace,
  cancelGraceIfActive,
  purgeExpiredGraces,
};
