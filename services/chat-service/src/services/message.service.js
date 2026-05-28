const {
  mongo,
  getRedisClient,
  encryptField,
  isEncrypted,
  isEncryptionEnabled,
  unwrapPlaintext,
  recordLazyMigrate,
} = require('/shared');
const { mongoose } = mongo;
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { invalidateSignedReadCacheForStoragePath } = require('../utils/attachSignedReadUrls');
const { toClientMessage } = require('../utils/messageDto');
const {
  pageTokenFilter,
  decodePageToken,
  encodePageToken,
  nextPageTokenFromDocs,
} = require('/shared/pagination/pageToken');
const {
  syncAfterCreate,
  syncAfterUpdate,
  syncAfterDelete,
} = require('../search/messageSearchSync');

const MONGO_UNAVAILABLE_MSG = 'Service temporarily unavailable. Please try again later.';

async function ensureMongoReady() {
  if (mongoose.connection.readyState === 1) return;

  const state = mongoose.connection.readyState;
  console.warn(
    `[ChatService] MongoDB not connected (readyState=${state}). Operation will fail fast instead of buffering.`
  );
  throw new Error(MONGO_UNAVAILABLE_MSG);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function postFilterSearchMessages(messages, { qTrim, mentionTrim, hasLink, hasEmbed }) {
  const needLink = hasLink === true || hasLink === 'true' || hasLink === '1';
  const needEmbed = hasEmbed === true || hasEmbed === 'true' || hasEmbed === '1';
  return messages.filter((m) => {
    const text = String(unwrapPlaintext(m.content) || '');
    const low = text.toLowerCase();
    if (qTrim && !low.includes(String(qTrim).toLowerCase())) return false;
    if (mentionTrim && !text.includes(mentionTrim)) return false;
    if (needLink && !/https?:\/\//i.test(text)) return false;
    if (needEmbed && !/<iframe|discord\.com\/channels|embed/i.test(text)) return false;
    return true;
  });
}

function normalizeMongoError(error) {
  if (
    error?.name === 'MongooseError' ||
    (error?.message && error.message.includes('buffering timed out'))
  ) {
    return new Error(MONGO_UNAVAILABLE_MSG);
  }
  return error;
}

function encryptContentIfEnabled(plain) {
  if (!isEncryptionEnabled()) return plain;
  return encryptField(String(plain ?? ''));
}

async function maybeMigrateMessageContent(doc) {
  if (!doc || !isEncryptionEnabled()) return;
  const updates = {};
  if (doc.content && !isEncrypted(doc.content)) {
    updates.content = encryptField(String(doc.content));
    updates.encV = 1;
    recordLazyMigrate();
  }
  if (doc.originalContent && !isEncrypted(doc.originalContent)) {
    updates.originalContent = encryptField(String(doc.originalContent));
    updates.encV = 1;
    recordLazyMigrate();
  }
  if (Object.keys(updates).length > 0) {
    await Message.updateOne({ _id: doc._id }, { $set: updates });
    Object.assign(doc, updates);
  }
}

class MessageService {
  async ensureDmConversation(senderId, receiverId, organizationId = null) {
    const a = String(senderId);
    const b = String(receiverId);
    const memberIds = [a, b]
      .sort()
      .map((id) => new mongoose.Types.ObjectId(id));
    const orgFilter = organizationId
      ? new mongoose.Types.ObjectId(String(organizationId))
      : null;

    let conversation = await Conversation.findOne({
      type: 'dm',
      members: { $all: memberIds, $size: 2 },
      organizationId: orgFilter,
    }).select('_id');

    if (!conversation) {
      conversation = await Conversation.create({
        type: 'dm',
        members: memberIds,
        organizationId: orgFilter,
      });
    }
    return conversation._id;
  }

  async createMessage(messageData) {
    try {
      await ensureMongoReady();
      const payload = { ...messageData };
      if (payload.receiverId && !payload.roomId) {
        payload.conversationId = await this.ensureDmConversation(
          payload.senderId,
          payload.receiverId,
          payload.organizationId || null
        );
      }
      if (payload.content !== undefined) {
        payload.content = encryptContentIfEnabled(payload.content);
        if (isEncryptionEnabled()) payload.encV = 1;
      }

      const message = new Message(payload);
      await message.save();
      void syncAfterCreate(message);

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${message._id}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(toClientMessage(message)));
        if (message.receiverId && message.senderId) {
          const a = String(message.senderId);
          const b = String(message.receiverId);
          const pair = [a, b].sort().join(':');
          await redis.del(`dm:last:${pair}`);
        }
      }

      return toClientMessage(message);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error creating message: ${err.message}`);
    }
  }

  async getMessageById(messageId) {
    try {
      await ensureMongoReady();
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const message = await Message.findById(messageId);
      if (message) await maybeMigrateMessageContent(message);

      if (redis && message) {
        const cacheKey = `message:${messageId}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(toClientMessage(message)));
      }

      return toClientMessage(message);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error getting message: ${err.message}`);
    }
  }

  /**
   * Tin nhắn gửi đến user (DM), không tính tin tự gửi; loại đã xóa/thu hồi.
   */
  async countIncomingMessagesInRange(userId, start, end) {
    try {
      await ensureMongoReady();
      const uid = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(String(userId))
        : userId;

      return Message.countDocuments({
        receiverId: uid,
        senderId: { $ne: uid },
        createdAt: { $gte: start, $lt: end },
        isDeleted: { $ne: true },
        isRecalled: { $ne: true },
      });
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error counting incoming messages: ${err.message}`);
    }
  }

  /** Số tin chưa đọc (gửi đến user). */
  async countUnreadIncoming(userId) {
    try {
      await ensureMongoReady();
      const uid = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(String(userId))
        : userId;

      return Message.countDocuments({
        receiverId: uid,
        senderId: { $ne: uid },
        isRead: false,
        isDeleted: { $ne: true },
        isRecalled: { $ne: true },
      });
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error counting unread messages: ${err.message}`);
    }
  }

  /**
   * Tin nhắn kênh tổ chức (có roomId + organizationId) chưa đọc, không phải do user gửi.
   * Lưu ý: isRead hiện là cờ đơn (phù hợp DM); với kênh nhiều người có thể cần mở rộng sau.
   */
  async findUnreadOrgRoomMessages(userId, limit = 30) {
    try {
      await ensureMongoReady();
      const uid = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(String(userId))
        : userId;

      const cap = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);

      const messages = await Message.find({
        roomId: { $exists: true, $ne: null },
        organizationId: { $exists: true, $ne: null },
        senderId: { $ne: uid },
        isRead: false,
        isDeleted: { $ne: true },
        isRecalled: { $ne: true },
      })
        .sort({ createdAt: -1 })
        .limit(cap)
        .exec();

      for (const m of messages) {
        await maybeMigrateMessageContent(m);
      }

      return messages.map((m) => toClientMessage(m));
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error listing unread org room messages: ${err.message}`);
    }
  }

  async getMessages(filter, options = {}) {
    try {
      await ensureMongoReady();
      const {
        page = 1,
        limit = 50,
        sort = { createdAt: -1, _id: -1 },
        dmCacheKey,
        pageToken,
        fields = 'summary',
      } = options;
      const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const dtoOpts = { fields: fields === 'full' ? 'full' : 'summary' };

      if (pageToken) {
        const tokPart = pageTokenFilter(pageToken);
        if (!tokPart) {
          return { messages: [], nextPageToken: null, hasMore: false };
        }
        const combined = { $and: [filter, tokPart] };
        const batch = await Message.find(combined)
          .sort(sort)
          .limit(lim + 1)
          .exec();
        for (const m of batch) await maybeMigrateMessageContent(m);
        const hasMore = batch.length > lim;
        const slice = hasMore ? batch.slice(0, lim) : batch;
        return {
          messages: slice.map((m) => toClientMessage(m, dtoOpts)),
          nextPageToken: nextPageTokenFromDocs(slice, { hasMore }),
          hasMore,
        };
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      if (pageNum > 1) {
        console.warn(
          '[chat-service] GET /messages: query `page` is deprecated; use `pageToken` + `nextPageToken`.'
        );
      }

      const redis = getRedisClient();
      if (redis && dmCacheKey && pageNum === 1 && lim <= 50) {
        const ck = `dm:last:${dmCacheKey}`;
        try {
          const cached = await redis.get(ck);
          if (cached) {
            return JSON.parse(cached);
          }
        } catch {
          /* miss */
        }
      }

      const messages = await Message.find(filter)
        .sort(sort)
        .limit(lim)
        .skip((pageNum - 1) * lim);

      for (const m of messages) {
        await maybeMigrateMessageContent(m);
      }

      const total = await Message.countDocuments(filter);

      const mapped = messages.map((m) => toClientMessage(m, dtoOpts));
      const hasMore = pageNum * lim < total;
      const lastDoc = messages.length ? messages[messages.length - 1] : null;
      const result = {
        messages: mapped,
        totalPages: Math.ceil(total / lim) || 1,
        currentPage: pageNum,
        total,
        hasMore,
        nextPageToken:
          hasMore && lastDoc
            ? encodePageToken({ createdAt: lastDoc.createdAt, id: lastDoc._id })
            : null,
      };

      if (redis && dmCacheKey && pageNum === 1 && lim <= 50) {
        try {
          await redis.setex(`dm:last:${dmCacheKey}`, 60, JSON.stringify(result));
        } catch {
          /* ignore cache write */
        }
      }

      return result;
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error getting messages: ${err.message}`);
    }
  }

  async markAsRead(messageId, userId) {
    try {
      await ensureMongoReady();
      const uid = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(String(userId))
        : userId;
      const existing = await Message.findById(messageId);
      if (!existing) return null;
      if (String(existing.receiverId) !== String(uid)) {
        throw new Error('Unauthorized');
      }
      if (existing.isRead) {
        return toClientMessage(existing);
      }

      const readAt = new Date();
      const message = await Message.findByIdAndUpdate(
        messageId,
        {
          isRead: true,
          readAt,
        },
        { new: true }
      );

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        await redis.del(cacheKey);
      }

      return toClientMessage(message);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error marking message as read: ${err.message}`);
    }
  }

  /** Đánh dấu đã đọc mọi tin DM incoming từ peer. */
  async markConversationAsRead(readerId, peerId) {
    try {
      await ensureMongoReady();
      const readerOid = mongoose.Types.ObjectId.isValid(readerId)
        ? new mongoose.Types.ObjectId(String(readerId))
        : readerId;
      const peerOid = mongoose.Types.ObjectId.isValid(peerId)
        ? new mongoose.Types.ObjectId(String(peerId))
        : peerId;

      const readAt = new Date();
      const filter = {
        receiverId: readerOid,
        senderId: peerOid,
        roomId: { $exists: false },
        isRead: false,
        isDeleted: { $ne: true },
        isRecalled: { $ne: true },
      };

      const last = await Message.findOne(filter).sort({ createdAt: -1 }).select('_id').exec();
      const result = await Message.updateMany(filter, { $set: { isRead: true, readAt } });

      return {
        modifiedCount: result.modifiedCount || 0,
        readAt,
        lastReadMessageId: last?._id ? String(last._id) : null,
      };
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error marking conversation as read: ${err.message}`);
    }
  }

  /** Số tin chưa đọc theo từng người gửi (DM). */
  async countUnreadByPeer(userId) {
    try {
      await ensureMongoReady();
      const uid = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(String(userId))
        : userId;

      const rows = await Message.aggregate([
        {
          $match: {
            receiverId: uid,
            senderId: { $ne: uid },
            isRead: false,
            isDeleted: { $ne: true },
            isRecalled: { $ne: true },
            $or: [{ roomId: { $exists: false } }, { roomId: null }],
          },
        },
        { $group: { _id: '$senderId', count: { $sum: 1 } } },
      ]);

      const byPeer = {};
      for (const row of rows) {
        if (row._id) byPeer[String(row._id)] = row.count;
      }
      return byPeer;
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error counting unread by peer: ${err.message}`);
    }
  }

  async addReaction(messageId, userId, emoji) {
    try {
      await ensureMongoReady();
      const em = String(emoji || '').trim();
      if (!em) throw new Error('emoji is required');

      const uid = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(String(userId))
        : userId;

      const msg = await Message.findById(messageId);
      if (!msg || msg.isDeleted || msg.isRecalled) return null;

      const sender = String(msg.senderId);
      const receiver = String(msg.receiverId || '');
      const me = String(uid);
      if (me !== sender && me !== receiver) {
        throw new Error('Unauthorized');
      }

      const reactions = Array.isArray(msg.reactions) ? [...msg.reactions] : [];
      const idx = reactions.findIndex(
        (r) => String(r.userId) === me && String(r.emoji) === em
      );
      if (idx >= 0) {
        return toClientMessage(msg);
      }
      reactions.push({ emoji: em, userId: uid, createdAt: new Date() });

      const updated = await Message.findByIdAndUpdate(
        messageId,
        { reactions },
        { new: true }
      );

      const redis = getRedisClient();
      if (redis) await redis.del(`message:${messageId}`);

      return toClientMessage(updated);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error adding reaction: ${err.message}`);
    }
  }

  async removeReaction(messageId, userId, emoji) {
    try {
      await ensureMongoReady();
      const em = String(emoji || '').trim();
      if (!em) throw new Error('emoji is required');

      const uid = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(String(userId))
        : userId;
      const me = String(uid);

      const msg = await Message.findById(messageId);
      if (!msg) return null;

      const sender = String(msg.senderId);
      const receiver = String(msg.receiverId || '');
      if (me !== sender && me !== receiver) {
        throw new Error('Unauthorized');
      }

      const reactions = (Array.isArray(msg.reactions) ? msg.reactions : []).filter(
        (r) => !(String(r.userId) === me && String(r.emoji) === em)
      );

      const updated = await Message.findByIdAndUpdate(
        messageId,
        { reactions },
        { new: true }
      );

      const redis = getRedisClient();
      if (redis) await redis.del(`message:${messageId}`);

      return toClientMessage(updated);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error removing reaction: ${err.message}`);
    }
  }

  async deleteMessage(messageId, userId) {
    try {
      await ensureMongoReady();
      const message = await Message.findOneAndUpdate(
        {
          _id: messageId,
          senderId: userId,
        },
        {
          isDeleted: true,
          deletedAt: new Date(),
        },
        { new: true }
      );

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        await redis.del(cacheKey);
      }

      void syncAfterDelete(message);

      const out = toClientMessage(message);
      if (out?.fileMeta?.storagePath) {
        await invalidateSignedReadCacheForStoragePath(out.fileMeta.storagePath);
      }

      return out;
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error deleting message: ${err.message}`);
    }
  }

  async recallMessage(messageId, userId) {
    try {
      await ensureMongoReady();
      const oldMessage = await Message.findById(messageId);
      if (!oldMessage || oldMessage.senderId.toString() !== userId.toString()) {
        return null;
      }

      const prevContent = oldMessage.content;
      const encPrev = isEncryptionEnabled() ? encryptField(unwrapPlaintext(prevContent)) : prevContent;

      const message = await Message.findOneAndUpdate(
        {
          _id: messageId,
          senderId: userId,
        },
        {
          isRecalled: true,
          recalledAt: new Date(),
          originalContent: encPrev,
        },
        { new: true }
      );

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        await redis.del(cacheKey);
      }

      void syncAfterUpdate(message);

      return toClientMessage(message);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error recalling message: ${err.message}`);
    }
  }

  /**
   * Xóa hẳn tin nhắn DM (bạn bè) giữa hai user — không có roomId (không xóa tin kênh tổ chức).
   * Dùng khi hủy kết bạn để gỡ nội dung hội thoại.
   */
  async deleteDirectMessagesBetweenUsers(userIdA, userIdB) {
    try {
      await ensureMongoReady();
      const toOid = (id) =>
        mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id;
      const a = toOid(userIdA);
      const b = toOid(userIdB);

      const filter = {
        $and: [
          {
            $or: [
              { senderId: a, receiverId: b },
              { senderId: b, receiverId: a },
            ],
          },
          {
            $or: [{ roomId: { $exists: false } }, { roomId: null }],
          },
        ],
      };

      const result = await Message.deleteMany(filter);

      return { deletedCount: result.deletedCount || 0 };
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error deleting DM messages: ${err.message}`);
    }
  }

  async editMessage(messageId, userId, newContent) {
    try {
      await ensureMongoReady();

      const oldMessage = await Message.findById(messageId);
      const senderStr = String(oldMessage?.senderId?._id || oldMessage?.senderId || '');
      if (!oldMessage || !userId || senderStr !== String(userId)) {
        return null;
      }

      const encNew = encryptContentIfEnabled(newContent);
      const encOrig = encryptContentIfEnabled(unwrapPlaintext(oldMessage.content));

      const message = await Message.findByIdAndUpdate(
        messageId,
        {
          content: encNew,
          originalContent: encOrig,
          editedAt: new Date(),
          ...(isEncryptionEnabled() ? { encV: 1 } : {}),
        },
        { new: true }
      );

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `message:${messageId}`;
        await redis.del(cacheKey);
      }

      void syncAfterUpdate(message);

      return toClientMessage(message);
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error editing message: ${err.message}`);
    }
  }

  /**
   * Đánh dấu file đã promote sang task — GC chat không xóa path (worker có thể đã xóa temp).
   */
  async promoteFileForTask(messageId, taskId) {
    try {
      await ensureMongoReady();
      const message = await Message.findOneAndUpdate(
        {
          _id: messageId,
          $or: [
            { 'fileMeta.promotedToTask': { $ne: true } },
            { 'fileMeta.promotedToTask': { $exists: false } },
          ],
        },
        {
          $set: {
            'fileMeta.promotedToTask': true,
            'fileMeta.taskId': taskId,
          },
        },
        { new: true }
      );
      const redis = getRedisClient();
      if (redis && message) {
        await redis.del(`message:${messageId}`);
      }
      return message ? toClientMessage(message) : null;
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error promoting file: ${err.message}`);
    }
  }

  /**
   * Tìm kiếm tin nhắn kênh tổ chức — roomId chỉ trong allowedRoomIds (từ organization-service).
   */
  async searchOrgMessages(params) {
    try {
      const { isMeiliSearchReady, searchOrgMessagesViaMeili } = require('./messageSearchEngine.service');
      if (await isMeiliSearchReady()) {
        try {
          return await searchOrgMessagesViaMeili(params);
        } catch (meiliErr) {
          console.warn(
            '[chat-service] Meilisearch search failed, fallback Mongo:',
            meiliErr.message
          );
        }
      }

      await ensureMongoReady();
      const {
        organizationId,
        allowedRoomIds,
        roomId,
        senderId,
        q,
        createdAfter,
        createdBefore,
        hasAttachment,
        hasLink,
        hasEmbed,
        messageType,
        mentionText,
        page = 1,
        limit = 20,
        pageToken,
        fields = 'summary',
      } = params;
      const dtoOpts = { fields: fields === 'full' ? 'full' : 'summary' };

      const oid = mongoose.Types.ObjectId.isValid(organizationId)
        ? new mongoose.Types.ObjectId(String(organizationId))
        : organizationId;

      const toOid = (id) =>
        mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id;

      let roomScope;
      if (roomId) {
        roomScope = toOid(roomId);
      } else {
        const ids = (allowedRoomIds || []).filter(Boolean);
        if (ids.length === 0) {
          return { messages: [], total: 0, currentPage: 1, totalPages: 0 };
        }
        roomScope = { $in: ids.map((id) => toOid(id)) };
      }

      const parts = [
        { organizationId: oid },
        { roomId: roomScope },
        { isDeleted: { $ne: true } },
        { isRecalled: { $ne: true } },
      ];

      if (senderId) parts.push({ senderId: toOid(senderId) });
      if (createdAfter || createdBefore) {
        const r = {};
        if (createdAfter) r.$gte = new Date(createdAfter);
        if (createdBefore) r.$lte = new Date(createdBefore);
        parts.push({ createdAt: r });
      }
      if (messageType) parts.push({ messageType });

      const wantAttach =
        hasAttachment === true || hasAttachment === 'true' || hasAttachment === '1';
      if (wantAttach) {
        parts.push({
          $or: [
            { messageType: 'file' },
            { messageType: 'image' },
            { 'fileMeta.storagePath': { $exists: true, $nin: [null, ''] } },
          ],
        });
      }

      const enc = isEncryptionEnabled();
      const qTrim = q && String(q).trim();
      const mentionTrim = mentionText && String(mentionText).trim();

      if (!enc && qTrim) {
        parts.push({ content: { $regex: escapeRegex(qTrim), $options: 'i' } });
      }
      if (!enc && mentionTrim) {
        parts.push({ content: { $regex: escapeRegex(mentionTrim), $options: 'i' } });
      }

      const filter = { $and: parts };

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

      if (!enc) {
        if (pageToken) {
          const tokPart = pageTokenFilter(pageToken);
          if (!tokPart) {
            return { messages: [], nextPageToken: null, hasMore: false };
          }
          const combined = { $and: [filter, tokPart] };
          const batch = await Message.find(combined)
            .sort({ createdAt: -1, _id: -1 })
            .limit(lim + 1)
            .exec();
          for (const m of batch) await maybeMigrateMessageContent(m);
          const hasMore = batch.length > lim;
          const slice = hasMore ? batch.slice(0, lim) : batch;
          let out = slice.map((m) => toClientMessage(m, dtoOpts));
          out = postFilterSearchMessages(out, {
            qTrim: null,
            mentionTrim: null,
            hasLink,
            hasEmbed,
          });
          return {
            messages: out,
            nextPageToken: nextPageTokenFromDocs(slice, { hasMore }),
            hasMore,
          };
        }

        if (pageNum > 1) {
          console.warn(
            '[chat-service] GET /messages/search: query `page` is deprecated; use `pageToken`.'
          );
        }
        const skip = (pageNum - 1) * lim;
        const messages = await Message.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(lim)
          .exec();
        for (const m of messages) await maybeMigrateMessageContent(m);
        let out = messages.map((m) => toClientMessage(m, dtoOpts));
        out = postFilterSearchMessages(out, { qTrim: null, mentionTrim: null, hasLink, hasEmbed });
        const total = await Message.countDocuments(filter);
        return {
          messages: out,
          total,
          currentPage: pageNum,
          totalPages: Math.max(1, Math.ceil(total / lim)),
          hasMore: pageNum * lim < total,
          nextPageToken: null,
        };
      }

      const scanCap = Math.min(parseInt(process.env.CHAT_SEARCH_SCAN_CAP || '400', 10) || 400, 2000);
      const raw = await Message.find(filter)
        .sort({ createdAt: -1 })
        .limit(scanCap)
        .exec();
      for (const m of raw) await maybeMigrateMessageContent(m);
      let out = raw.map((m) => toClientMessage(m, dtoOpts));
      out = postFilterSearchMessages(out, { qTrim, mentionTrim, hasLink, hasEmbed });
      const total = out.length;
      if (pageToken) {
        const tok = decodePageToken(pageToken);
        if (tok) {
          const t = tok.createdAt.getTime();
          const tid = tok.id;
          out = out.filter((m) => {
            const ca = new Date(m.createdAt).getTime();
            const mid = String(m._id || m.id || '');
            return ca < t || (ca === t && mid < tid);
          });
        }
      }
      const hasMore = out.length > lim;
      const paged = out.slice(0, lim);
      return {
        messages: paged,
        total: null,
        currentPage: null,
        totalPages: null,
        hasMore,
        nextPageToken: nextPageTokenFromDocs(paged, { hasMore }),
      };
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error searching messages: ${err.message}`);
    }
  }

  /** Tìm kiếm tin DM giữa user và peer (không có roomId). */
  async searchDmMessages(userId, peerId, options = {}) {
    try {
      await ensureMongoReady();
      const { q, page = 1, limit = 30, pageToken, fields = 'summary' } = options;
      const dtoOpts = { fields: fields === 'full' ? 'full' : 'summary' };
      if (!userId || !peerId) {
        return { messages: [], total: 0, currentPage: 1, totalPages: 0 };
      }

      const me = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(String(userId))
        : userId;
      const peer = mongoose.Types.ObjectId.isValid(peerId)
        ? new mongoose.Types.ObjectId(String(peerId))
        : peerId;

      const parts = [
        {
          $or: [
            { senderId: me, receiverId: peer },
            { senderId: peer, receiverId: me },
          ],
        },
        { $or: [{ roomId: { $exists: false } }, { roomId: null }] },
        { isDeleted: { $ne: true } },
        { isRecalled: { $ne: true } },
      ];

      const enc = isEncryptionEnabled();
      const qTrim = q && String(q).trim();
      if (!enc && qTrim) {
        parts.push({ content: { $regex: escapeRegex(qTrim), $options: 'i' } });
      }

      const filter = { $and: parts };
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);

      if (!enc) {
        if (pageToken) {
          const tokPart = pageTokenFilter(pageToken);
          if (!tokPart) {
            return { messages: [], nextPageToken: null, hasMore: false };
          }
          const combined = { $and: [filter, tokPart] };
          const batch = await Message.find(combined)
            .sort({ createdAt: -1, _id: -1 })
            .limit(lim + 1)
            .exec();
          for (const m of batch) await maybeMigrateMessageContent(m);
          const hasMore = batch.length > lim;
          const slice = hasMore ? batch.slice(0, lim) : batch;
          return {
            messages: slice.map((m) => toClientMessage(m, dtoOpts)),
            nextPageToken: nextPageTokenFromDocs(slice, { hasMore }),
            hasMore,
          };
        }
        if (pageNum > 1) {
          console.warn(
            '[chat-service] DM search: query `page` is deprecated; use `pageToken`.'
          );
        }
        const skip = (pageNum - 1) * lim;
        const messages = await Message.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(lim)
          .exec();
        for (const m of messages) await maybeMigrateMessageContent(m);
        const total = await Message.countDocuments(filter);
        return {
          messages: messages.map((m) => toClientMessage(m, dtoOpts)),
          total,
          currentPage: pageNum,
          totalPages: Math.max(1, Math.ceil(total / lim)),
          hasMore: pageNum * lim < total,
          nextPageToken: null,
        };
      }

      const scanCap = Math.min(parseInt(process.env.CHAT_SEARCH_SCAN_CAP || '400', 10) || 400, 2000);
      const raw = await Message.find(filter).sort({ createdAt: -1 }).limit(scanCap).exec();
      for (const m of raw) await maybeMigrateMessageContent(m);
      let out = raw.map((m) => toClientMessage(m, dtoOpts));
      if (qTrim) {
        const low = qTrim.toLowerCase();
        out = out.filter((m) => String(m.content || '').toLowerCase().includes(low));
      }
      const total = out.length;
      const skip = (pageNum - 1) * lim;
      const slice = out.slice(skip, skip + lim);
      const hasMore = skip + lim < total;
      return {
        messages: slice,
        total,
        currentPage: pageNum,
        totalPages: Math.max(1, Math.ceil(total / lim)),
        hasMore,
        nextPageToken: null,
      };
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error searching DM messages: ${err.message}`);
    }
  }

  /**
   * GC: xóa object Storage + soft-delete message có file hết hạn.
   */
  async runStorageGcOnce() {
    const { firebaseStorage } = require('/shared');
    if (!firebaseStorage.isEnabled()) {
      return { scanned: 0, deleted: 0, skipped: true };
    }
    try {
      await ensureMongoReady();
      const now = new Date();
      const msgs = await Message.find({
        'fileMeta.expiresAt': { $lte: now },
        'fileMeta.storagePath': { $exists: true, $nin: [null, ''] },
        'fileMeta.promotedToTask': { $ne: true },
        isDeleted: { $ne: true },
      })
        .limit(parseInt(process.env.STORAGE_GC_BATCH || '50', 10) || 50)
        .lean();

      let deleted = 0;
      for (const m of msgs) {
        const path = m.fileMeta?.storagePath;
        if (!path) continue;
        try {
          await firebaseStorage.deleteObject(path);
        } catch (e) {
          /* vẫn cập nhật DB nếu 404 */
        }
        await invalidateSignedReadCacheForStoragePath(path);
        await Message.updateOne(
          { _id: m._id },
          {
            $set: {
              isDeleted: true,
              deletedAt: new Date(),
              content: encryptContentIfEnabled('[Tệp đã hết hạn]'),
              messageType: 'system',
            },
            $unset: { fileMeta: 1 },
          }
        );
        const redis = getRedisClient();
        if (redis) await redis.del(`message:${m._id}`);
        deleted += 1;
      }
      return { scanned: msgs.length, deleted, skipped: false };
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Storage GC: ${err.message}`);
    }
  }
}

module.exports = new MessageService();
