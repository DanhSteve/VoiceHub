const { mongo } = require('/shared');
const { mongoose } = mongo;
const Friend = require('../models/Friend');
const {
  getRedisClient,
  friendWebhook,
  logger,
  emitRealtimeEvent,
  fetchUserProfileByIdInternal,
} = require('/shared');
const axios = require('axios');
const {
  scheduleGrace,
  cancelGraceIfActive,
  findActiveGrace,
  gracePeriodHoursForClient,
  getGracePeriodMs,
} = require('./unfriendGrace.service');

function toObjectId(id) {
  if (id == null) return null;
  const s = String(id).trim();
  if (!s) return null;
  if (mongoose.Types.ObjectId.isValid(s)) {
    return new mongoose.Types.ObjectId(s);
  }
  return s;
}

/** Tìm hai chiều quan hệ accepted; hỗ trợ friendId là userId hoặc _id bản ghi Friend. */
async function resolveAcceptedFriendRows(actorUserId, targetId) {
  const actor = toObjectId(actorUserId);
  const target = toObjectId(targetId);
  if (!actor || !target) {
    return { rows: [], peerUserId: null };
  }

  const pairQuery = (uidA, uidB) => ({
    status: 'accepted',
    $or: [
      { userId: uidA, friendId: uidB },
      { userId: uidB, friendId: uidA },
    ],
  });

  let rows = await Friend.find(pairQuery(actor, target)).lean();
  let peerUserId = target;

  if (!rows.length && mongoose.Types.ObjectId.isValid(String(targetId))) {
    const byDoc = await Friend.findOne({ _id: targetId, status: 'accepted' }).lean();
    if (byDoc) {
      const docUser = toObjectId(byDoc.userId);
      const docFriend = toObjectId(byDoc.friendId);
      const actorStr = String(actor);
      if (String(docUser) === actorStr) {
        peerUserId = docFriend;
      } else if (String(docFriend) === actorStr) {
        peerUserId = docUser;
      }
      if (peerUserId) {
        rows = await Friend.find(pairQuery(actor, peerUserId)).lean();
      }
    }
  }

  return {
    rows,
    peerUserId: peerUserId ? String(peerUserId) : String(targetId),
  };
}

const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!USER_SERVICE_URL) throw new Error('Thiếu biến môi trường: USER_SERVICE_URL');
const USER_SERVICE_INTERNAL_TOKEN = process.env.USER_SERVICE_INTERNAL_TOKEN || '';

const MONGO_UNAVAILABLE_MSG = 'Service temporarily unavailable. Please try again later.';

async function clearFriendsListCache(...userIds) {
  const redis = getRedisClient();
  if (!redis) return;
  for (const rawId of userIds) {
    const id = String(rawId || '').trim();
    if (!id) continue;
    await redis.del(`friends:${id}:accepted`);
    await redis.del(`friends:${id}:blocked`);
    await redis.del(`friends:${id}`);
  }
}

const MONGO_READY_WAIT_MS = 8000;
const MONGO_READY_POLL_MS = 300;

/** Khi connection bị ngắt (Atlas/idle), chủ động reconnect rồi đợi sẵn sàng; nếu không được thì throw */
async function ensureMongoReady() {
  if (mongoose.connection.readyState === 1) return;

  const state = mongoose.connection.readyState;
  logger.warn(`MongoDB not connected (readyState=${state}). Attempting reconnect...`);

  const uri = process.env.MONGODB_URI;
  if (uri) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 15000,
      });
      if (mongoose.connection.readyState === 1) {
        logger.info('MongoDB reconnected successfully');
        return;
      }
    } catch (err) {
      logger.warn('MongoDB reconnect attempt failed:', err.message);
    }
  }

  const deadline = Date.now() + MONGO_READY_WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, MONGO_READY_POLL_MS));
    if (mongoose.connection.readyState === 1) {
      logger.info('MongoDB became ready after wait');
      return;
    }
  }

  logger.warn(`MongoDB still not connected after ${MONGO_READY_WAIT_MS}ms. Check MONGODB_URI and network.`);
  throw new Error(MONGO_UNAVAILABLE_MSG);
}

/** Chuẩn hóa lỗi Mongoose (buffering timeout, ...) thành message thân thiện */
function normalizeMongoError(error) {
  if (error.message === MONGO_UNAVAILABLE_MSG) throw error;
  if (error.name === 'MongooseError' || (error.message && error.message.includes('buffering timed out'))) {
    logger.warn('MongoDB operation failed:', error.message);
    throw new Error(MONGO_UNAVAILABLE_MSG);
  }
  throw error;
}

class FriendService {
  // Gửi lời mời kết bạn
  async sendFriendRequest(userId, friendId) {
    try {
      await ensureMongoReady();
      // Kiểm tra user và friend có tồn tại không
      try {
        await Promise.all([
          fetchUserProfileByIdInternal(userId),
          fetchUserProfileByIdInternal(friendId),
        ]);
      } catch (error) {
        logger.warn('sendFriendRequest user lookup:', error.message);
        throw new Error('User not found');
      }

      const actor = toObjectId(userId);
      const peer = toObjectId(friendId);
      if (!actor || !peer) {
        throw new Error('User not found');
      }

      // Kiểm tra đã có relationship chưa
      const existing = await Friend.findOne({
        $or: [
          { userId: actor, friendId: peer },
          { userId: peer, friendId: actor },
        ],
      });

      if (existing) {
        if (existing.status === 'accepted') {
          throw new Error('Already friends');
        }
        if (existing.status === 'blocked') {
          throw new Error('Cannot send friend request to blocked user');
        }
        if (existing.status === 'pending') {
          if (existing.requestedBy.toString() === userId.toString()) {
            throw new Error('Friend request already sent');
          }
          throw new Error('Friend request already received');
        }
      }

      await cancelGraceIfActive(userId, friendId);

      // Tạo friend request
      const friend = new Friend({
        userId: actor,
        friendId: peer,
        status: 'pending',
        requestedBy: actor,
      });

      await friend.save();

      const actorStr = String(userId);
      const peerStr = String(friendId);
      let senderName = 'Someone';
      try {
        const res = await fetchUserProfileByIdInternal(actorStr);
        const data = res.data?.data || res.data;
        senderName = data?.displayName || data?.username || senderName;
      } catch (nameErr) {
        logger.warn('sendFriendRequest sender profile:', nameErr.message);
      }

      try {
        await friendWebhook.requestSent(actorStr, peerStr, senderName);
      } catch (webhookErr) {
        logger.warn('sendFriendRequest webhook:', webhookErr.message);
      }

      const realtimePayload = {
        requesterId: actorStr,
        receiverId: peerStr,
        requestId: String(friend._id),
        status: 'pending',
        timestamp: new Date().toISOString(),
      };
      await emitRealtimeEvent({
        event: 'friend:request_received',
        userId: peerStr,
        payload: realtimePayload,
      });
      await emitRealtimeEvent({
        event: 'friend:request_sent',
        userId: peerStr,
        payload: realtimePayload,
      });

      logger.info(`Friend request sent: ${actorStr} -> ${peerStr}`);
      return friend;
    } catch (error) {
      const msg = String(error?.message || '');
      const business =
        msg.includes('Friend request already') ||
        msg.includes('Already friends') ||
        msg.includes('Cannot send friend request') ||
        msg.includes('Cannot add yourself') ||
        msg === 'User not found';
      if (business) throw error;
      normalizeMongoError(error);
      logger.error('Error sending friend request:', error);
      throw error;
    }
  }

  // Chấp nhận lời mời kết bạn
  async acceptFriendRequest(userId, friendId) {
    try {
      await ensureMongoReady();
      await cancelGraceIfActive(userId, friendId);

      const friend = await Friend.findOne({
        userId: friendId,
        friendId: userId,
        status: 'pending',
      });

      if (!friend) {
        throw new Error('Friend request not found');
      }

      friend.status = 'accepted';
      friend.acceptedAt = new Date();
      await friend.save();

      // Tạo reverse relationship
      const reverseFriend = await Friend.findOne({
        userId,
        friendId,
      });

      if (!reverseFriend) {
        const newFriend = new Friend({
          userId,
          friendId,
          status: 'accepted',
          requestedBy: friend.requestedBy,
          acceptedAt: new Date(),
        });
        await newFriend.save();
      } else {
        reverseFriend.status = 'accepted';
        reverseFriend.acceptedAt = new Date();
        await reverseFriend.save();
      }

      await emitRealtimeEvent({
        event: 'friend:request_accepted',
        userIds: [String(userId), String(friendId)],
        payload: {
          userId: String(userId),
          friendId: String(friendId),
          acceptedAt: friend.acceptedAt,
          timestamp: new Date().toISOString(),
        },
      });

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        await clearFriendsListCache(userId, friendId);
      }

      // Gửi webhook
      try {
        const userResponse = await fetchUserProfileByIdInternal(friendId);
        const friendName = userResponse.data?.data?.displayName || userResponse.data?.data?.username || 'Someone';
        await friendWebhook.requestAccepted(userId, friendId, friendName);
      } catch (error) {
        logger.error('Error sending friend accepted webhook:', error);
      }

      logger.info(`Friend request accepted: ${userId} <-> ${friendId}`);
      return friend;
    } catch (error) {
      normalizeMongoError(error);
      logger.error('Error accepting friend request:', error);
      throw new Error(`Error accepting friend request: ${error.message}`);
    }
  }

  // Từ chối/ Hủy lời mời kết bạn
  async rejectFriendRequest(userId, friendId) {
    try {
      await ensureMongoReady();
      const friend = await Friend.findOneAndDelete({
        $or: [
          { userId: friendId, friendId: userId, status: 'pending' },
          { userId, friendId, status: 'pending' },
        ],
      });

      if (!friend) {
        throw new Error('Friend request not found');
      }

      const requesterId = String(friend.userId);
      const receiverId = String(friend.friendId);
      await emitRealtimeEvent({
        event: 'friend:request_rejected',
        userIds: [requesterId, receiverId],
        payload: {
          requesterId,
          receiverId,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info(`Friend request rejected: ${userId} <-> ${friendId}`);
      return friend;
    } catch (error) {
      normalizeMongoError(error);
      logger.error('Error rejecting friend request:', error);
      throw new Error(`Error rejecting friend request: ${error.message}`);
    }
  }

  // Chặn user
  async blockUser(userId, friendId) {
    try {
      await ensureMongoReady();
      await cancelGraceIfActive(userId, friendId);

      const priorAccepted = await Friend.findOne({ userId, friendId, status: 'accepted' }).lean();
      const priorAcceptedAt = priorAccepted?.acceptedAt || null;
      const priorRequestedBy = priorAccepted?.requestedBy || userId;

      // Xóa relationship hiện tại
      await Friend.deleteMany({
        $or: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      });

      // Tạo block relationship
      const block = new Friend({
        userId,
        friendId,
        status: 'blocked',
        requestedBy: priorRequestedBy,
        acceptedAt: priorAcceptedAt,
      });

      await block.save();

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        await clearFriendsListCache(userId);
      }

      logger.info(`User blocked: ${userId} blocked ${friendId}`);
      await emitRealtimeEvent({
        event: 'friend:blocked',
        userIds: [String(userId), String(friendId)],
        payload: {
          blockerId: String(userId),
          blockedId: String(friendId),
          timestamp: new Date().toISOString(),
        },
      });
      return block;
    } catch (error) {
      normalizeMongoError(error);
      logger.error('Error blocking user:', error);
      throw new Error(`Error blocking user: ${error.message}`);
    }
  }

  // Bỏ chặn user
  async unblockUser(userId, friendId) {
    try {
      await ensureMongoReady();
      const block = await Friend.findOneAndDelete({
        userId,
        friendId,
        status: 'blocked',
      });

      if (!block) {
        throw new Error('Block relationship not found');
      }

      const acceptedAt = block.acceptedAt || new Date();
      const requestedBy = block.requestedBy || userId;

      await Friend.findOneAndUpdate(
        { userId, friendId },
        {
          $set: {
            status: 'accepted',
            requestedBy,
            acceptedAt,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      const reverseFriend = await Friend.findOne({ userId: friendId, friendId: userId });
      if (!reverseFriend) {
        await new Friend({
          userId: friendId,
          friendId: userId,
          status: 'accepted',
          requestedBy,
          acceptedAt,
        }).save();
      } else if (reverseFriend.status !== 'accepted') {
        reverseFriend.status = 'accepted';
        reverseFriend.acceptedAt = acceptedAt;
        reverseFriend.requestedBy = requestedBy;
        await reverseFriend.save();
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        await clearFriendsListCache(userId);
      }

      logger.info(`User unblocked: ${userId} unblocked ${friendId}`);
      await emitRealtimeEvent({
        event: 'friend:unblocked',
        userIds: [String(userId), String(friendId)],
        payload: {
          blockerId: String(userId),
          blockedId: String(friendId),
          timestamp: new Date().toISOString(),
        },
      });
      return block;
    } catch (error) {
      normalizeMongoError(error);
      logger.error('Error unblocking user:', error);
      throw new Error(`Error unblocking user: ${error.message}`);
    }
  }

  // Lấy danh sách bạn bè
  async getFriends(userId, options = {}) {
    try {
      await ensureMongoReady();
      const { status = 'accepted', page = 1, limit = 50 } = options;

      const cacheKey = `friends:${userId}:${status}`;

      // Kiểm tra cache
      const redis = getRedisClient();
      if (redis) {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const friends = await Friend.find({ userId, status })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ acceptedAt: -1, createdAt: -1 })
        .lean();

      const total = await Friend.countDocuments({ userId, status });

      const friendIds = [...new Set(friends.map((f) => f.friendId?.toString()).filter(Boolean))];
      const userMap = {};
      await Promise.all(
        friendIds.map(async (id) => {
          try {
            const res = await fetchUserProfileByIdInternal(id);
            const data = res.data?.data || res.data;
            if (data) userMap[id] = { _id: data.userId || data._id, username: data.username, displayName: data.displayName, avatar: data.avatar, status: data.status };
          } catch (err) {
            logger.warn('Could not fetch user for friend list:', id, err.message);
          }
        })
      );

      let presenceMap = {};
      if (USER_SERVICE_INTERNAL_TOKEN && friendIds.length > 0) {
        try {
          const pr = await axios.post(
            `${USER_SERVICE_URL}/api/users/internal/presence/batch`,
            { userIds: friendIds },
            {
              headers: { 'x-internal-token': USER_SERVICE_INTERNAL_TOKEN },
              timeout: 8000,
              validateStatus: () => true,
            }
          );
          if (pr.status === 200 && pr.data?.data && typeof pr.data.data === 'object') {
            presenceMap = pr.data.data;
          }
        } catch (err) {
          logger.warn('presence batch failed:', err.message);
        }
      }

      const result = {
        friends: friends.map((f) => {
          const uid = f.friendId?.toString();
          const u = userMap[uid];
          const mergedFriend = u
            ? {
                ...u,
                status:
                  presenceMap[uid] === 'online' ? 'online' : u.status || 'offline',
              }
            : f.friendId;
          return {
            friendId: mergedFriend,
            relationshipStatus: f.status,
            acceptedAt: f.acceptedAt,
            createdAt: f.createdAt,
          };
        }),
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };

      // Cache result
      if (redis) {
        await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5 minutes
      }

      return result;
    } catch (error) {
      normalizeMongoError(error);
      logger.error('Error getting friends:', error);
      throw new Error(`Error getting friends: ${error.message}`);
    }
  }

  // Lấy danh sách lời mời kết bạn (không populate vì friend-service không có model User; gọi user-service để lấy thông tin)
  async getFriendRequests(userId, type = 'received') {
    try {
      await ensureMongoReady();
      const actor = toObjectId(userId);
      if (!actor) return [];

      const query =
        type === 'sent'
          ? { userId: actor, status: 'pending', requestedBy: actor }
          : { friendId: actor, status: 'pending', requestedBy: { $ne: actor } };

      const requests = await Friend.find(query).sort({ createdAt: -1 }).lean();

      const idField = type === 'sent' ? 'friendId' : 'userId';
      const ids = [...new Set(requests.map((r) => r[idField]?.toString()).filter(Boolean))];

      const userMap = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetchUserProfileByIdInternal(id);
            const data = res.data?.data || res.data;
            if (data) userMap[id] = { _id: data.userId || data._id, username: data.username, displayName: data.displayName, avatar: data.avatar };
          } catch (err) {
            logger.warn('Could not fetch user for friend request:', id, err.message);
          }
        })
      );

      return requests.map((r) => {
        const id = r[idField]?.toString();
        const user = userMap[id] || null;
        const enriched = { ...r, [idField]: user || r[idField] };
        if (type === 'received') {
          return {
            ...enriched,
            requester: user || enriched.userId,
            fromUser: user || enriched.userId,
          };
        }
        return {
          ...enriched,
          recipient: user || enriched.friendId,
        };
      });
    } catch (error) {
      normalizeMongoError(error);
      logger.error('Error getting friend requests:', error);
      throw new Error(`Error getting friend requests: ${error.message}`);
    }
  }

  // Hủy kết bạn — xóa quan hệ ngay; DM xóa vĩnh viễn sau grace (mặc định 12h) nếu không kết bạn lại.
  async removeFriend(userId, friendId) {
    try {
      await ensureMongoReady();

      const actorId = String(userId || '').trim();
      const { rows: acceptedRows, peerUserId } = await resolveAcceptedFriendRows(actorId, friendId);
      const peerId = peerUserId || String(friendId || '').trim();

      if (!acceptedRows.length) {
        const grace = await findActiveGrace(actorId, peerId);
        if (grace) {
          return {
            deletedCount: 0,
            purgeAt: grace.purgeAt,
            graceHours: gracePeriodHoursForClient(),
            alreadyRemoved: true,
          };
        }
        throw new Error('Friend relationship not found');
      }

      const metaRow =
        acceptedRows.find((r) => String(r.userId) === actorId) || acceptedRows[0];

      const result = await Friend.deleteMany({
        _id: { $in: acceptedRows.map((r) => r._id) },
      });

      let graceDoc;
      try {
        graceDoc = await scheduleGrace({
          userId: actorId,
          friendId: peerId,
          dissolvedBy: actorId,
          meta: {
            requestedBy: metaRow?.requestedBy,
            acceptedAt: metaRow?.acceptedAt,
          },
        });
      } catch (graceErr) {
        logger.error(
          `Friend rows deleted but grace schedule failed (${actorId} <-> ${peerId}):`,
          graceErr
        );
        graceDoc = { purgeAt: new Date(Date.now() + getGracePeriodMs()) };
      }

      const redis = getRedisClient();
      if (redis) {
        await clearFriendsListCache(actorId, peerId);
      }

      logger.info(
        `Friend removed (grace until ${graceDoc.purgeAt.toISOString()}): ${actorId} <-> ${peerId}`
      );

      await emitRealtimeEvent({
        event: 'friend:removed',
        userIds: [actorId, peerId],
        payload: {
          userId: actorId,
          friendId: peerId,
          purgeAt: graceDoc.purgeAt.toISOString(),
          graceHours: gracePeriodHoursForClient(),
          timestamp: new Date().toISOString(),
        },
      });

      return {
        deletedCount: result.deletedCount,
        purgeAt: graceDoc.purgeAt,
        graceHours: gracePeriodHoursForClient(),
      };
    } catch (error) {
      normalizeMongoError(error);
      const msg = String(error?.message || '');
      if (msg === 'Friend relationship not found' || msg.includes('Invalid user pair')) {
        throw error;
      }
      logger.error('Error removing friend:', error);
      throw new Error(`Error removing friend: ${error.message}`);
    }
  }

  // Kiểm tra relationship (userId, friendId có thể là string hoặc ObjectId)
  async getRelationship(userId, friendId) {
    try {
      // Tránh buffer timeout: nếu MongoDB chưa kết nối (0=disconnected, 2=connecting) thì không chờ 10s
      if (mongoose.connection.readyState !== 1) {
        logger.warn(`MongoDB not connected (readyState=${mongoose.connection.readyState}), skipping relationship check`);
        return { status: 'none' };
      }

      const toObjectId = (id) => {
        if (id == null) return null;
        if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) return id;
        if (id && id.toString && typeof id.toString === 'function') return id.toString();
        return null;
      };
      const id1 = toObjectId(userId);
      const id2 = toObjectId(friendId);
      if (!id1 || !id2) return { status: 'none' };

      const grace = await findActiveGrace(id1, id2);
      if (grace) {
        return {
          status: 'dissolving',
          purgeAt: grace.purgeAt,
          dissolvedAt: grace.dissolvedAt,
          canRestoreUntil: grace.purgeAt,
        };
      }

      const friend = await Friend.findOne({
        $or: [
          { userId: id1, friendId: id2 },
          { userId: id2, friendId: id1 },
        ],
      }).maxTimeMS(5000);

      if (!friend) {
        return { status: 'none' };
      }

      const base = {
        status: friend.status,
        requestedBy: friend.requestedBy,
        acceptedAt: friend.acceptedAt,
      };
      if (friend.status === 'blocked') {
        base.blockerId = String(friend.userId);
        base.blockedId = String(friend.friendId);
      }
      return base;
    } catch (error) {
      // Buffering timeout hoặc lỗi MongoDB: trả 'none' thay vì throw để search vẫn trả về user
      if (error.name === 'MongooseError' || (error.message && error.message.includes('buffering timed out'))) {
        logger.warn('MongoDB unavailable for relationship check:', error.message);
        return { status: 'none' };
      }
      logger.error('Error getting relationship:', error);
      throw new Error(`Error getting relationship: ${error.message}`);
    }
  }
}

module.exports = new FriendService();

