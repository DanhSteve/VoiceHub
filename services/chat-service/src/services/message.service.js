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
const { invalidateSignedReadCacheForStoragePath } = require('../utils/attachSignedReadUrls');

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

function toClientMessage(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.content = unwrapPlaintext(o.content);
  if (o.originalContent) o.originalContent = unwrapPlaintext(o.originalContent);
  return o;
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
  async createMessage(messageData) {
    try {
      await ensureMongoReady();
      const payload = { ...messageData };
      if (payload.content !== undefined) {
        payload.content = encryptContentIfEnabled(payload.content);
        if (isEncryptionEnabled()) payload.encV = 1;
      }

      const message = new Message(payload);
      await message.save();

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
      const { page = 1, limit = 50, sort = { createdAt: -1 }, dmCacheKey } = options;

      const redis = getRedisClient();
      if (redis && dmCacheKey && page === 1 && limit <= 50) {
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

      const messages = await Message.find(filter).sort(sort).limit(limit * 1).skip((page - 1) * limit);

      for (const m of messages) {
        await maybeMigrateMessageContent(m);
      }

      const total = await Message.countDocuments(filter);

      const result = {
        messages: messages.map((m) => toClientMessage(m)),
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };

      if (redis && dmCacheKey && page === 1 && limit <= 50) {
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
      const message = await Message.findByIdAndUpdate(
        messageId,
        {
          isRead: true,
          readAt: new Date(),
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
      if (!oldMessage || oldMessage.senderId.toString() !== userId.toString()) {
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
      const message = await Message.findByIdAndUpdate(
        messageId,
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
      } = params;

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
        const skip = (pageNum - 1) * lim;
        const messages = await Message.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(lim)
          .exec();
        for (const m of messages) await maybeMigrateMessageContent(m);
        let out = messages.map((m) => toClientMessage(m));
        out = postFilterSearchMessages(out, { qTrim: null, mentionTrim: null, hasLink, hasEmbed });
        const total = await Message.countDocuments(filter);
        return {
          messages: out,
          total,
          currentPage: pageNum,
          totalPages: Math.max(1, Math.ceil(total / lim)),
        };
      }

      const scanCap = Math.min(parseInt(process.env.CHAT_SEARCH_SCAN_CAP || '400', 10) || 400, 2000);
      const raw = await Message.find(filter)
        .sort({ createdAt: -1 })
        .limit(scanCap)
        .exec();
      for (const m of raw) await maybeMigrateMessageContent(m);
      let out = raw.map((m) => toClientMessage(m));
      out = postFilterSearchMessages(out, { qTrim, mentionTrim, hasLink, hasEmbed });
      const total = out.length;
      const skip = (pageNum - 1) * lim;
      const paged = out.slice(skip, skip + lim);
      return {
        messages: paged,
        total,
        currentPage: pageNum,
        totalPages: Math.max(1, Math.ceil(total / lim)),
      };
    } catch (error) {
      const err = normalizeMongoError(error);
      throw new Error(`Error searching messages: ${err.message}`);
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
