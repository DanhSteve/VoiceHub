const { randomUUID } = require('crypto');
const axios = require('axios');
const { mongoose } = require('/shared/config/mongo');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
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
const { buildTrustedGatewayHeaders } = require('/shared/middleware/gatewayTrust');
const { assertDmCanSend, dmErrorToJson } = require('../utils/verifyDmRelationship');

async function emitDmToParticipants(event, message, extra = {}) {
  if (!message?.receiverId) return;
  const sender = String(message.senderId?._id || message.senderId || '');
  const receiver = String(message.receiverId?._id || message.receiverId || '');
  const payload = { ...message, ...extra };
  await Promise.all([
    emitRealtimeEvent({ event, userId: receiver, payload }),
    emitRealtimeEvent({ event, userId: sender, payload }),
  ]);
}

/** Header gọi organization-service: tin cậy gateway (giống proxy) hoặc Bearer để /auth/me. */
function headersForOrganizationForward(req) {
  const headers = {};
  const uid = String(req.user?.id || req.user?.userId || req.user?._id || '').trim();
  const gwTok = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (uid && gwTok) {
    Object.assign(headers, buildTrustedGatewayHeaders(uid));
  } else {
    const fx = req.headers['x-user-id'];
    const fgw = String(req.headers['x-gateway-internal-token'] || '').trim();
    if (fx && fgw) {
      headers['x-user-id'] = String(fx).trim();
      headers['x-gateway-internal-token'] = fgw;
      const em = req.headers['x-user-email'];
      if (em) headers['x-user-email'] = em;
    }
  }
  const auth = req.headers?.authorization;
  if (auth) headers.Authorization = auth;
  return headers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Chỉ retry lỗi tạm (mạng / 5xx org); không retry 401/403/404. */
function shouldRetryAccessibleChannelFetch(err, attempt, maxAttempts) {
  if (attempt >= maxAttempts) return false;
  const st = err.response?.status;
  if (st === 401 || st === 403 || st === 404) return false;
  if (st >= 500) return true;
  if (!err.response) return true;
  const c = err.code;
  return (
    c === 'ECONNREFUSED' ||
    c === 'ENOTFOUND' ||
    c === 'ETIMEDOUT' ||
    c === 'ECONNRESET' ||
    String(err.message || '').toLowerCase().includes('timeout')
  );
}

async function fetchAccessibleChannelIds(orgId, req) {
  const base = (process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013').replace(
    /\/$/,
    ''
  );
  const url = `${base}/api/organizations/${orgId}/accessible-channel-ids`;
  const timeoutMs = Number(process.env.ORG_ACCESSIBLE_CHANNELS_TIMEOUT_MS || 12000);
  const maxAttempts = Math.max(1, Math.min(5, Number(process.env.ORG_ACCESSIBLE_CHANNELS_RETRY_ATTEMPTS || 3)));
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { data } = await axios.get(url, {
        headers: headersForOrganizationForward(req),
        timeout: timeoutMs,
      });
      const ids = data?.data?.channelIds;
      if (!Array.isArray(ids)) {
        // eslint-disable-next-line no-console
        console.warn('[fetchAccessibleChannelIds] response không có channelIds[], coi như rỗng', {
          orgId,
          attempt,
        });
        return [];
      }
      return ids.map(String);
    } catch (e) {
      lastErr = e;
      if (shouldRetryAccessibleChannelFetch(e, attempt, maxAttempts)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[fetchAccessibleChannelIds] lần ${attempt}/${maxAttempts} lỗi, thử lại:`,
          e.response?.status,
          e.code
        );
        await sleep(350 * attempt);
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

async function fetchAccessibleChannelPermissionMatrix(orgId, req) {
  const base = (process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013').replace(
    /\/$/,
    ''
  );
  const url = `${base}/api/organizations/${orgId}/accessible-channel-ids`;
  const { data } = await axios.get(url, {
    headers: headersForOrganizationForward(req),
    timeout: Number(process.env.ORG_ACCESSIBLE_CHANNELS_TIMEOUT_MS || 12000),
  });
  const ids = Array.isArray(data?.data?.channelIds) ? data.data.channelIds.map(String) : [];
  const matrix =
    data?.data?.permissionsByChannelId && typeof data.data.permissionsByChannelId === 'object'
      ? data.data.permissionsByChannelId
      : {};
  return { ids, matrix };
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
        try {
          await assertDmCanSend({
            peerId: receiverId,
            authorizationHeader: req.headers?.authorization,
          });
        } catch (dmErr) {
          if (dmErr.statusCode) {
            return res.status(dmErr.statusCode).json(dmErrorToJson(dmErr));
          }
          throw dmErr;
        }
      }

      if (roomId) {
        messageData.roomId = roomId;
        if (organizationId) {
          const { matrix } = await fetchAccessibleChannelPermissionMatrix(organizationId, req);
          const perms = matrix[String(roomId)] || {};
          if (!Boolean(perms.canWrite)) {
            return res.status(403).json({
              success: false,
              message: 'Bạn không có quyền chat trong kênh này',
            });
          }
        }
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

  /** Tìm trong hội thoại DM với một bạn. */
  async searchDmMessages(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const { peerId, q, page, limit } = req.query || {};
      if (!userId || !peerId) {
        return res.status(400).json({
          success: false,
          message: 'peerId is required',
        });
      }
      const result = await messageService.searchDmMessages(userId, peerId, {
        q: q || '',
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 30,
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
      let allowedRoomIds;
      try {
        allowedRoomIds = await fetchAccessibleChannelIds(organizationId, req);
      } catch (e) {
        const upstream = e.response?.status;
        const body = e.response?.data || {};
        const upstreamMsg =
          (typeof body === 'string' && body) ||
          body.message ||
          body.error ||
          (body.status === 'fail' && body.message) ||
          '';
        // eslint-disable-next-line no-console
        console.error(
          '[searchMessages] accessible-channel-ids failed:',
          upstream,
          e.code,
          e.message
        );
        if (upstream === 401) {
          return res.status(401).json({
            success: false,
            code: 'ORG_CHANNEL_AUTH_REQUIRED',
            message: upstreamMsg || 'Unauthorized',
          });
        }
        if (upstream === 403) {
          return res.status(403).json({
            success: false,
            code: 'ORG_CHANNEL_ACCESS_DENIED',
            message: upstreamMsg || 'Access denied',
          });
        }
        if (upstream >= 500) {
          return res.status(502).json({
            success: false,
            code: 'CHANNEL_ACCESS_ORG_ERROR',
            message: 'Organization service error while verifying channels',
          });
        }
        const transient =
          e.code === 'ECONNREFUSED' ||
          e.code === 'ENOTFOUND' ||
          e.code === 'ETIMEDOUT' ||
          e.code === 'ECONNRESET' ||
          e.message?.toLowerCase().includes('timeout');
        if (transient || !upstream) {
          return res.status(503).json({
            success: false,
            code: 'CHANNEL_ACCESS_VERIFY_FAILED',
            message: 'Could not verify channel access',
          });
        }
        return res.status(502).json({
          success: false,
          code: 'CHANNEL_ACCESS_ORG_ERROR',
          message: upstreamMsg || 'Could not verify channel access',
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
      const userId = req.user?.id || req.user?._id;
      const q = req.query || {};
      const {
        receiverId,
        roomId,
        organizationId,
        page,
        limit,
        markConversationRead,
        unreadByPeer,
        search,
      } = q;
      const searchQ = q.q;

      if (String(unreadByPeer || '') === '1') {
        if (!userId) {
          return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const byPeer = await messageService.countUnreadByPeer(userId);
        return res.json({ success: true, data: { byPeer } });
      }

      if (
        receiverId &&
        (String(search || '') === '1' || String(search || '') === 'true') &&
        String(searchQ || '').trim().length >= 1
      ) {
        if (!userId) {
          return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const result = await messageService.searchDmMessages(userId, receiverId, {
          q: searchQ || '',
          page: parseInt(page, 10) || 1,
          limit: parseInt(limit, 10) || 30,
        });
        const messages = await attachSignedReadUrlsToMessages(result.messages || []);
        return res.json({
          success: true,
          data: { ...result, messages },
        });
      }

      if (receiverId && (String(markConversationRead || '') === '1' || markConversationRead === true)) {
        if (!userId) {
          return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const result = await messageService.markConversationAsRead(userId, receiverId);
        if (result.modifiedCount > 0) {
          await emitRealtimeEvent({
            event: 'friend:messages_read',
            userId: String(receiverId),
            payload: {
              peerId: String(receiverId),
              readerId: String(userId),
              readAt: result.readAt,
              lastReadMessageId: result.lastReadMessageId,
            },
          });
        }
        return res.json({ success: true, data: result });
      }

      const filter = {};

      if (receiverId) {
        if (!mongoose.Types.ObjectId.isValid(String(userId)) || !mongoose.Types.ObjectId.isValid(String(receiverId))) {
          return res.status(400).json({
            success: false,
            message: 'Invalid user id',
          });
        }
        const me = new mongoose.Types.ObjectId(String(userId));
        const peer = new mongoose.Types.ObjectId(String(receiverId));
        const orgFilter = organizationId && mongoose.Types.ObjectId.isValid(String(organizationId))
          ? new mongoose.Types.ObjectId(String(organizationId))
          : null;
        const dmConversation = await Conversation.findOne({
          type: 'dm',
          members: { $all: [me, peer], $size: 2 },
          organizationId: orgFilter,
        }).select('_id');

        if (dmConversation?._id) {
          // Ưu tiên query theo conversationId mới; vẫn giữ fallback dữ liệu cũ chưa có conversationId.
          filter.$or = [
            { conversationId: dmConversation._id },
            {
              conversationId: { $exists: false },
              $or: [
                { senderId: userId, receiverId },
                { senderId: receiverId, receiverId: userId },
              ],
            },
            {
              conversationId: null,
              $or: [
                { senderId: userId, receiverId },
                { senderId: receiverId, receiverId: userId },
              ],
            },
          ];
        } else {
          filter.$or = [
            { senderId: userId, receiverId },
            { senderId: receiverId, receiverId: userId },
          ];
        }
      } else if (roomId) {
        if (organizationId) {
          const { matrix } = await fetchAccessibleChannelPermissionMatrix(organizationId, req);
          const perms = matrix[String(roomId)] || {};
          if (!Boolean(perms.canRead)) {
            return res.status(403).json({
              success: false,
              message: 'Bạn không có quyền đọc kênh này',
            });
          }
        }
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
      const status = error.message === 'Unauthorized' ? 403 : 500;
      res.status(status).json({
        success: false,
        message: error.message,
      });
    }
  }

  /** Đánh dấu đã đọc toàn bộ tin DM từ một bạn. */
  async markConversationAsRead(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const { peerId } = req.body || {};
      if (!userId || !peerId) {
        return res.status(400).json({
          success: false,
          message: 'peerId is required',
        });
      }

      const result = await messageService.markConversationAsRead(userId, peerId);

      if (result.modifiedCount > 0) {
        await emitRealtimeEvent({
          event: 'friend:messages_read',
          userId: String(peerId),
          payload: {
            peerId: String(peerId),
            readerId: String(userId),
            readAt: result.readAt,
            lastReadMessageId: result.lastReadMessageId,
          },
        });
      }

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

  /** Số tin chưa đọc theo từng bạn (DM). */
  async getUnreadByPeer(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const byPeer = await messageService.countUnreadByPeer(userId);
      res.json({ success: true, data: { byPeer } });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async addReaction(req, res) {
    try {
      const { messageId } = req.params;
      const { emoji } = req.body || {};
      const userId = req.user?.id || req.user?._id;

      const message = await messageService.addReaction(messageId, userId, emoji);
      if (!message) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }

      const data = (await attachSignedReadUrlToMessage(message)) || message;
      await emitDmToParticipants('friend:message_reaction', data);

      res.json({ success: true, data });
    } catch (error) {
      const status = error.message === 'Unauthorized' ? 403 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  }

  async removeReaction(req, res) {
    try {
      const { messageId, emoji } = req.params;
      const userId = req.user?.id || req.user?._id;

      const message = await messageService.removeReaction(
        messageId,
        userId,
        decodeURIComponent(emoji || '')
      );
      if (!message) {
        return res.status(404).json({ success: false, message: 'Message not found' });
      }

      const data = (await attachSignedReadUrlToMessage(message)) || message;
      await emitDmToParticipants('friend:message_reaction', data);

      res.json({ success: true, data });
    } catch (error) {
      const status = error.message === 'Unauthorized' ? 403 : 500;
      res.status(status).json({ success: false, message: error.message });
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

      const data = (await attachSignedReadUrlToMessage(message)) || message;

      res.json({
        success: true,
        message: 'Message deleted successfully',
        data,
      });

      if (message?.receiverId && !message?.roomId) {
        await emitDmToParticipants('friend:message_deleted', data, {
          messageId: String(messageId),
        });
      }

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

      if (message?.receiverId && !message?.roomId) {
        await emitDmToParticipants('friend:message_recalled', data, {
          messageId: String(messageId),
        });
      }

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
      } else if (message.receiverId) {
        await emitDmToParticipants('friend:message_edited', payloadMessage, {
          messageId: String(messageId),
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

  /** Service-to-service: xóa mọi tin nhắn kênh tổ chức (organization-service khi owner xóa org) */
  async purgeOrganizationMessagesInternal(req, res) {
    try {
      const { organizationId } = req.body || {};
      if (!organizationId || !mongoose.Types.ObjectId.isValid(String(organizationId))) {
        return res.status(400).json({ success: false, message: 'organizationId is required and must be valid' });
      }
      const oid = new mongoose.Types.ObjectId(String(organizationId));
      const result = await Message.deleteMany({ organizationId: oid });
      return res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new MessageController();




