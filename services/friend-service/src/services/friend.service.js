const { mongo } = require('/shared');
const { mongoose } = mongo;
const Friend = require('../models/Friend');
const { getRedisClient, friendWebhook, logger, emitRealtimeEvent } = require('/shared');
const axios = require('axios');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:3004';
const CHAT_SERVICE_URL = process.env.CHAT_SERVICE_URL || 'http://chat-service:3006';
const CHAT_INTERNAL_TOKEN = process.env.CHAT_INTERNAL_TOKEN || '';
const USER_SERVICE_INTERNAL_TOKEN = process.env.USER_SERVICE_INTERNAL_TOKEN || '';

const MONGO_UNAVAILABLE_MSG = 'Service temporarily unavailable. Please try again later.';

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
          axios.get(`${USER_SERVICE_URL}/api/users/${userId}`),
          axios.get(`${USER_SERVICE_URL}/api/users/${friendId}`),
        ]);
      } catch (error) {
        throw new Error('User not found');
      }

      // Kiểm tra đã có relationship chưa
      const existing = await Friend.findOne({
        $or: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      });

      if (existing) {
        if (existing.status === 'accepted') {
          throw new Error('Already friends');
        }
        if (existing.status === 'blocked') {
          throw new Error('Cannot send friend request to blocked user');
        }
        if (existing.status === 'pending' && existing.requestedBy.toString() === userId.toString()) {
          throw new Error('Friend request already sent');
        }
      }

      // Tạo friend request
      const friend = new Friend({
        userId,
        friendId,
        status: 'pending',
        requestedBy: userId,
      });

      await friend.save();

      await emitRealtimeEvent({
        event: 'friend:request_sent',
        userId: String(friendId),
        payload: {
          requesterId: String(userId),
          receiverId: String(friendId),
          requestId: String(friend._id),
          status: 'pending',
          timestamp: new Date().toISOString(),
        },
      });

      logger.info(`Friend request sent: ${userId} -> ${friendId}`);
      return friend;
    } catch (error) {
      normalizeMongoError(error);
      logger.error('Error sending friend request:', error);
      throw new Error(`Error sending friend request: ${error.message}`);
    }
  }

  // Chấp nhận lời mời kết bạn
  async acceptFriendRequest(userId, friendId) {
    try {
      await ensureMongoReady();
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
        await redis.del(`friends:${userId}`);
        await redis.del(`friends:${friendId}`);
      }

      // Gửi webhook
      try {
        const userResponse = await axios.get(`${USER_SERVICE_URL}/api/users/${friendId}`);
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
        requestedBy: userId,
      });

      await block.save();

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        await redis.del(`friends:${userId}`);
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

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        await redis.del(`friends:${userId}`);
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
      // Kiểm tra cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `friends:${userId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const { status = 'accepted', page = 1, limit = 50 } = options;

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
            const res = await axios.get(`${USER_SERVICE_URL}/api/users/${id}`);
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
        const cacheKey = `friends:${userId}`;
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
      const query =
        type === 'sent'
          ? { userId, status: 'pending', requestedBy: userId }
          : { friendId: userId, status: 'pending', requestedBy: { $ne: userId } };

      const requests = await Friend.find(query).sort({ createdAt: -1 }).lean();

      const idField = type === 'sent' ? 'friendId' : 'userId';
      const ids = [...new Set(requests.map((r) => r[idField]?.toString()).filter(Boolean))];

      const userMap = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await axios.get(`${USER_SERVICE_URL}/api/users/${id}`);
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
        return { ...r, [idField]: user || r[idField] };
      });
    } catch (error) {
      normalizeMongoError(error);
      logger.error('Error getting friend requests:', error);
      throw new Error(`Error getting friend requests: ${error.message}`);
    }
  }

  // Xóa bạn bè
  async removeFriend(userId, friendId) {
    try {
      await ensureMongoReady();
      const result = await Friend.deleteMany({
        $or: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
        status: 'accepted',
      });

      if (result.deletedCount === 0) {
        throw new Error('Friend relationship not found');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        await redis.del(`friends:${userId}`);
        await redis.del(`friends:${friendId}`);
      }

      logger.info(`Friend removed: ${userId} <-> ${friendId}`);

      // Xóa toàn bộ tin nhắn DM giữa hai người (chat-service)
      if (CHAT_INTERNAL_TOKEN) {
        try {
          await axios.post(
            `${CHAT_SERVICE_URL}/api/messages/internal/dm/delete-between`,
            { userIdA: String(userId), userIdB: String(friendId) },
            {
              headers: { 'x-internal-token': CHAT_INTERNAL_TOKEN },
              timeout: 20000,
            }
          );
          logger.info(`DM messages purged for pair ${userId} <-> ${friendId}`);
        } catch (chatErr) {
          logger.warn(
            `Could not purge DM messages after unfriend: ${chatErr.response?.data?.message || chatErr.message}`
          );
        }
      } else {
        logger.warn('CHAT_INTERNAL_TOKEN not set; DM messages are not deleted from database on unfriend');
      }

      await emitRealtimeEvent({
        event: 'friend:removed',
        userIds: [String(userId), String(friendId)],
        payload: {
          userId: String(userId),
          friendId: String(friendId),
          timestamp: new Date().toISOString(),
        },
      });
      return result;
    } catch (error) {
      normalizeMongoError(error);
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

      const friend = await Friend.findOne({
        $or: [
          { userId: id1, friendId: id2 },
          { userId: id2, friendId: id1 },
        ],
      }).maxTimeMS(5000);

      if (!friend) {
        return { status: 'none' };
      }

      return {
        status: friend.status,
        requestedBy: friend.requestedBy,
        acceptedAt: friend.acceptedAt,
      };
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

