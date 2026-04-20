const { randomUUID } = require('crypto');
const axios = require('axios');
const messageService = require('../services/message.service');
const { emitRealtimeEvent, firebaseStorage } = require('/shared');
const {
  attachSignedReadUrlsToMessages,
  attachSignedReadUrlToMessage,
} = require('../utils/attachSignedReadUrls');
const {
  ttlMsForRetentionContext,
  MAX_UPLOAD_BYTES,
  isMimeAllowed,
} = require('../config/fileRetention');
const { publishTaskAiSyncEvent } = require('../messaging/taskAiSyncPublisher');

async function fetchAccessibleChannelIds(orgId, authHeader) {
  const base = (process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013').replace(
    /\/$/,
    ''
  );
  const url = `${base}/api/organizations/${orgId}/accessible-channel-ids`;
  const { data } = await axios.get(url, {
    headers: authHeader ? { Authorization: authHeader } : {},
    timeout: 12000,
  });
  const ids = data?.data?.channelIds;
  return Array.isArray(ids) ? ids.map(String) : [];
}

class MessageController {
  /**
   * Nội bộ: xóa toàn bộ DM giữa hai user (friend-service gọi khi xóa bạn).
   * Bảo vệ bằng header x-internal-token (CHAT_INTERNAL_TOKEN).
   */
  async deleteDmBetweenUsers(req, res) {
    try {
      const { userIdA, userIdB } = req.body || {};
      if (!userIdA || !userIdB) {
        return res.status(400).json({
          success: false,
          message: 'userIdA and userIdB are required',
        });
      }

      const result = await messageService.deleteDirectMessagesBetweenUsers(userIdA, userIdB);

      await emitRealtimeEvent({
        event: 'friend:dm_cleared',
        userIds: [String(userIdA), String(userIdB)],
        payload: {
          userIdA: String(userIdA),
          userIdB: String(userIdB),
          deletedCount: result.deletedCount,
        },
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Nội bộ: lấy message kèm fileMeta (task-service / worker).
   */
  async getMessageInternal(req, res) {
    try {
      const { messageId } = req.params;
      const message = await messageService.getMessageById(messageId);
      if (!message) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }
      return res.json({ success: true, data: message });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Nội bộ: đánh dấu file đã gắn task.
   */
  async promoteMessageFileInternal(req, res) {
    try {
      const { messageId } = req.params;
      const { taskId } = req.body || {};
      if (!taskId) {
        return res.status(400).json({ success: false, message: 'taskId is required' });
      }
      const updated = await messageService.promoteFileForTask(messageId, taskId);
      if (!updated) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }
      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Nội bộ: tạo signed read URL từ storagePath (ai-task-worker, task-service, ...).
   * Bảo vệ bằng header x-internal-token (CHAT_INTERNAL_TOKEN).
   */
  async getSignedReadUrlInternal(req, res) {
    try {
      if (!firebaseStorage.isEnabled()) {
        return res.status(503).json({
          success: false,
          message: 'Firebase Storage is not configured on server',
        });
      }
      const storagePath = String(req.query?.storagePath || '').trim();
      if (!storagePath) {
        return res.status(400).json({ success: false, message: 'storagePath is required' });
      }
      const ttlMs = Number(req.query?.ttlMs || 10 * 60 * 1000);
      const { url } = await firebaseStorage.getSignedReadUrl(storagePath, ttlMs);
      return res.json({ success: true, data: { url } });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Client: lấy signed URL upload lên Firebase (temp), không cần Firebase Auth.
   */
  async createSignedUploadUrl(req, res) {
    try {
      if (!firebaseStorage.isEnabled()) {
        return res.status(503).json({
          success: false,
          message: 'Firebase Storage is not configured on server',
        });
      }

      const userId = req.user?.id || req.user?._id;
      const { fileName, mimeType, size, retentionContext } = req.body || {};

      if (!fileName || !mimeType || size == null || !retentionContext) {
        return res.status(400).json({
          success: false,
          message: 'fileName, mimeType, size, retentionContext are required',
        });
      }

      if (!['dm', 'org_room', 'meeting'].includes(retentionContext)) {
        return res.status(400).json({
          success: false,
          message: 'retentionContext must be dm | org_room | meeting',
        });
      }

      const n = Number(size);
      if (Number.isNaN(n) || n <= 0 || n > MAX_UPLOAD_BYTES) {
        return res.status(400).json({
          success: false,
          message: `Invalid size (max ${MAX_UPLOAD_BYTES} bytes)`,
        });
      }

      if (!isMimeAllowed(mimeType)) {
        return res.status(400).json({
          success: false,
          message: 'MIME type not allowed',
        });
      }

      const safe = firebaseStorage.sanitizeFileName(fileName);
      const storagePath = `temp/${String(userId)}/${randomUUID()}_${safe}`;

      const { uploadUrl, expires: uploadUrlExpires } = await firebaseStorage.getSignedUploadUrl(
        storagePath,
        mimeType,
        firebaseStorage.DEFAULT_UPLOAD_URL_MINUTES
      );

      const fileExpiresAt = new Date(Date.now() + ttlMsForRetentionContext(retentionContext));

      res.json({
        success: true,
        data: {
          uploadUrl,
          storagePath,
          bucket: process.env.FIREBASE_STORAGE_BUCKET,
          uploadUrlExpiresAt: uploadUrlExpires.toISOString(),
          fileExpiresAt: fileExpiresAt.toISOString(),
          retentionContext,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Tạo tin nhắn mới
  async createMessage(req, res) {
    try {
      const { content, receiverId, roomId, messageType, organizationId, fileMeta, replyToMessageId } =
        req.body;
      const senderId = req.user?.id || req.user?._id;

      if (!content || (!receiverId && !roomId)) {
        return res.status(400).json({
          success: false,
          message: 'Content and receiverId or roomId are required',
        });
      }

      const messageData = {
        senderId,
        content,
        messageType: messageType || 'text',
        organizationId,
      };

      if (receiverId) {
        messageData.receiverId = receiverId;
      }

      if (roomId) {
        messageData.roomId = roomId;
      }

      if (replyToMessageId) {
        const parent = await messageService.getMessageById(replyToMessageId);
        if (!parent) {
          return res.status(400).json({
            success: false,
            message: 'Invalid reply target',
          });
        }
        if (roomId) {
          if (String(parent.roomId || '') !== String(roomId)) {
            return res.status(400).json({
              success: false,
              message: 'Invalid reply target',
            });
          }
        } else if (receiverId) {
          if (parent.roomId) {
            return res.status(400).json({
              success: false,
              message: 'Invalid reply target',
            });
          }
          const u1 = String(senderId);
          const u2 = String(receiverId);
          const pSend = String(parent.senderId?._id || parent.senderId || '');
          const pRecv = String(parent.receiverId?._id || parent.receiverId || '');
          const sameDm =
            (pSend === u1 && pRecv === u2) || (pSend === u2 && pRecv === u1);
          if (!sameDm) {
            return res.status(400).json({
              success: false,
              message: 'Invalid reply target',
            });
          }
        } else {
          return res.status(400).json({
            success: false,
            message: 'Invalid reply target',
          });
        }
        messageData.replyToMessageId = replyToMessageId;
      }

      const mt = messageData.messageType;
      if (fileMeta && (mt === 'image' || mt === 'file')) {
        const sp = fileMeta.storagePath;
        const prefix = `temp/${String(senderId)}/`;
        if (!sp || typeof sp !== 'string' || !sp.startsWith(prefix)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid fileMeta.storagePath for this user',
          });
        }
        const ctx = fileMeta.retentionContext || (receiverId ? 'dm' : 'org_room');
        if (!['dm', 'org_room', 'meeting'].includes(ctx)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid retentionContext',
          });
        }
        messageData.fileMeta = {
          storagePath: sp,
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
          originalName: fileMeta.originalName || '',
          mimeType: fileMeta.mimeType || '',
          byteSize: fileMeta.byteSize,
          retentionContext: ctx,
          storageTier: 'temp',
          expiresAt: new Date(Date.now() + ttlMsForRetentionContext(ctx)),
        };
        // content giữ tên file (req.body); signed read URL gắn khi trả API/emit.
      }

      const message = await messageService.createMessage(messageData);
      const payloadMessage =
        (await attachSignedReadUrlToMessage(message)) || message;

      if (receiverId) {
        await Promise.all([
          emitRealtimeEvent({
            event: 'friend:new_message',
            userId: String(receiverId),
            payload: payloadMessage,
          }),
          emitRealtimeEvent({
            event: 'friend:sent',
            userId: String(senderId),
            payload: payloadMessage,
          }),
        ]);
      }

      if (roomId) {
        await emitRealtimeEvent({
          event: 'room:new_message',
          roomId: String(roomId),
          payload: payloadMessage,
        });
      }

      res.status(201).json({
        success: true,
        data: payloadMessage,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Danh sách tin nhắn kênh tổ chức chưa đọc (mới nhất trước).
   */
  async getUnreadOrgMessagesFeed(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
      const messages = await messageService.findUnreadOrgRoomMessages(userId, limit);
      const enriched = await attachSignedReadUrlsToMessages(messages);

      res.json({
        success: true,
        data: { messages: enriched },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Thống kê tin nhắn cho dashboard: hôm nay / hôm qua + % thay đổi (tin gửi đến user, DM).
   */
  async getMessageStatsSummary(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endToday = new Date(startToday);
      endToday.setDate(endToday.getDate() + 1);

      const startYesterday = new Date(startToday);
      startYesterday.setDate(startYesterday.getDate() - 1);
      const endYesterday = startToday;

      const [todayCount, yesterdayCount, unreadCount] = await Promise.all([
        messageService.countIncomingMessagesInRange(userId, startToday, endToday),
        messageService.countIncomingMessagesInRange(userId, startYesterday, endYesterday),
        messageService.countUnreadIncoming(userId),
      ]);

      let changePercent = 0;
      let trend = 'flat';
      if (yesterdayCount > 0) {
        changePercent = Math.round(((todayCount - yesterdayCount) / yesterdayCount) * 100);
        if (changePercent > 0) trend = 'up';
        else if (changePercent < 0) trend = 'down';
        else trend = 'flat';
      } else if (todayCount > 0) {
        changePercent = 100;
        trend = 'up';
      }

      res.json({
        success: true,
        data: {
          todayCount,
          yesterdayCount,
          unreadCount,
          changePercent,
          trend,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy tin nhắn theo ID
  async getMessageById(req, res) {
    try {
      const { messageId } = req.params;
      const message = await messageService.getMessageById(messageId);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found',
        });
      }

      const data = (await attachSignedReadUrlToMessage(message)) || message;

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  /** Tìm kiếm tin nhắn trong kênh tổ chức — organizationId bắt buộc; roomId giới trong kênh được phép. */
  async searchMessages(req, res) {
    try {
      const q = req.query || {};
      const organizationId = q.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'organizationId is required',
        });
      }
      const authHeader = req.headers.authorization;
      let allowedRoomIds;
      try {
        allowedRoomIds = await fetchAccessibleChannelIds(organizationId, authHeader);
      } catch (e) {
        return res.status(503).json({
          success: false,
          message: 'Could not verify channel access',
        });
      }
      if (!allowedRoomIds.length) {
        return res.json({
          success: true,
          data: {
            messages: [],
            total: 0,
            currentPage: 1,
            totalPages: 0,
          },
        });
      }
      const roomId = q.roomId || null;
      if (roomId && !allowedRoomIds.includes(String(roomId))) {
        return res.status(403).json({
          success: false,
          message: 'Cannot search in this channel',
        });
      }
      const result = await messageService.searchOrgMessages({
        organizationId,
        allowedRoomIds,
        roomId,
        senderId: q.senderId || null,
        q: q.q || '',
        createdAfter: q.createdAfter || null,
        createdBefore: q.createdBefore || null,
        hasAttachment: q.hasAttachment,
        hasLink: q.hasLink,
        hasEmbed: q.hasEmbed,
        messageType: q.messageType || null,
        mentionText: q.mentionText || null,
        page: parseInt(q.page, 10) || 1,
        limit: parseInt(q.limit, 10) || 20,
      });
      const messages = await attachSignedReadUrlsToMessages(result.messages || []);
      res.json({
        success: true,
        data: { ...result, messages },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy danh sách tin nhắn
  async getMessages(req, res) {
    try {
      const { receiverId, roomId, organizationId, page, limit } = req.query;
      const userId = req.user?.id || req.user?._id;

      const filter = {};

      if (receiverId) {
        filter.$or = [
          { senderId: userId, receiverId },
          { senderId: receiverId, receiverId: userId },
        ];
      } else if (roomId) {
        filter.roomId = roomId;
      } else {
        filter.$or = [
          { senderId: userId },
          { receiverId: userId },
        ];
      }

      if (organizationId) {
        filter.organizationId = organizationId;
      }

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      };

      if (receiverId && userId) {
        const a = String(userId);
        const b = String(receiverId);
        options.dmCacheKey = [a, b].sort().join(':');
      }

      const result = await messageService.getMessages(filter, options);
      const messages = await attachSignedReadUrlsToMessages(result.messages || []);

      res.json({
        success: true,
        data: { ...result, messages },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Đánh dấu tin nhắn đã đọc
  async markAsRead(req, res) {
    try {
      const { messageId } = req.params;
      const userId = req.user?.id || req.user?._id;

      const message = await messageService.markAsRead(messageId, userId);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found',
        });
      }

      const data = (await attachSignedReadUrlToMessage(message)) || message;

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa tin nhắn
  async deleteMessage(req, res) {
    try {
      const { messageId } = req.params;
      const userId = req.user?.id || req.user?._id;

      const message = await messageService.deleteMessage(messageId, userId);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or unauthorized',
        });
      }

      res.json({
        success: true,
        message: 'Message deleted successfully',
      });

      try {
        if (message?.organizationId) {
          await publishTaskAiSyncEvent({
            messageId: String(messageId),
            organizationId: String(message.organizationId),
            changeType: 'deleted',
          });
        }
      } catch (e) {
        // best-effort
        console.warn('[chat-service] publish task-ai.sync failed:', e.message);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Thu hồi tin nhắn (Recall)
  async recallMessage(req, res) {
    try {
      const { messageId } = req.params;
      const userId = req.user?.id || req.user?._id;

      const message = await messageService.recallMessage(messageId, userId);

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or unauthorized',
        });
      }

      const data = (await attachSignedReadUrlToMessage(message)) || message;

      res.json({
        success: true,
        message: 'Message recalled successfully',
        data,
      });

      try {
        if (message?.organizationId) {
          await publishTaskAiSyncEvent({
            messageId: String(messageId),
            organizationId: String(message.organizationId),
            changeType: 'recalled',
          });
        }
      } catch (e) {
        console.warn('[chat-service] publish task-ai.sync failed:', e.message);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Chỉnh sửa tin nhắn
  async editMessage(req, res) {
    try {
      const { messageId } = req.params;
      const { content } = req.body;
      const userId = req.user?.id || req.user?._id;

      if (!content || !content.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Content is required',
        });
      }

      const message = await messageService.editMessage(messageId, userId, content.trim());

      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message not found or unauthorized',
        });
      }

      const payloadMessage = (await attachSignedReadUrlToMessage(message)) || message;
      if (message.roomId) {
        await emitRealtimeEvent({
          event: 'room:message_edited',
          roomId: String(message.roomId),
          payload: payloadMessage,
        });
      }

      res.json({
        success: true,
        message: 'Message edited successfully',
        data: payloadMessage,
      });

      try {
        if (message?.organizationId) {
          await publishTaskAiSyncEvent({
            messageId: String(messageId),
            organizationId: String(message.organizationId),
            changeType: 'edited',
          });
        }
      } catch (e) {
        console.warn('[chat-service] publish task-ai.sync failed:', e.message);
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new MessageController();




