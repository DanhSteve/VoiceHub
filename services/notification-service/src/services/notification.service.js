const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const {
  getRedisClient,
  logger,
  emitRealtimeEvent,
  encryptField,
  isEncrypted,
  isEncryptionEnabled,
  unwrapPlaintext,
  recordLazyMigrate,
} = require('/shared');

function encText(val) {
  if (val === undefined || val === null) return val;
  if (!isEncryptionEnabled()) return String(val);
  return encryptField(String(val));
}

const { toClientNotification } = require('../utils/notificationDto');
const {
  getCachedUnreadCount,
  setCachedUnreadCount,
  invalidateUnreadBadgeCache,
} = require('../cache/notificationReadCache');
const {
  emitUnreadSnapshots,
  targetsFromNotificationDoc,
} = require('./notificationUnreadPush');

async function maybeMigrateNotification(doc) {
  if (!doc || !isEncryptionEnabled()) return;
  const updates = {};
  if (doc.title && !isEncrypted(doc.title)) {
    updates.title = encryptField(String(doc.title));
    updates.encV = 1;
    recordLazyMigrate();
  }
  if (doc.content && !isEncrypted(doc.content)) {
    updates.content = encryptField(String(doc.content));
    updates.encV = 1;
    recordLazyMigrate();
  }
  if (doc.actionUrl && !isEncrypted(doc.actionUrl)) {
    updates.actionUrl = encryptField(String(doc.actionUrl));
    updates.encV = 1;
    recordLazyMigrate();
  }
  if (Object.keys(updates).length > 0) {
    await Notification.updateOne({ _id: doc._id }, { $set: updates });
    Object.assign(doc, updates);
  }
}

function buildScopeMongoFilter(scope) {
  const normalized = String(scope || '').trim().toLowerCase();
  if (normalized !== 'personal' && normalized !== 'organization') return null;

  const noOrgId = {
    $or: [
      { 'data.organizationId': { $exists: false } },
      { 'data.organizationId': null },
      { 'data.organizationId': '' },
    ],
  };
  const noWorkspaceId = {
    $or: [
      { 'data.workspaceId': { $exists: false } },
      { 'data.workspaceId': null },
      { 'data.workspaceId': '' },
    ],
  };
  const hasOrgId = {
    'data.organizationId': { $exists: true, $nin: [null, ''] },
  };
  const hasWorkspaceId = {
    'data.workspaceId': { $exists: true, $nin: [null, ''] },
  };

  if (normalized === 'personal') {
    return { $and: [noOrgId, noWorkspaceId] };
  }
  return { $or: [hasOrgId, hasWorkspaceId] };
}

class NotificationService {
  async createNotification(notificationData) {
    try {
      const { userId, type, title, content, data, actionUrl } = notificationData;

      const notification = new Notification({
        userId,
        type,
        title: encText(title),
        content: encText(content),
        data: data || {},
        actionUrl: actionUrl != null ? encText(actionUrl) : null,
        ...(isEncryptionEnabled() ? { encV: 1 } : {}),
      });

      await notification.save();

      const clientN = toClientNotification(notification);

      await emitRealtimeEvent({
        event: 'notification:new',
        userId: String(userId),
        payload: {
          notification: clientN,
          timestamp: new Date().toISOString(),
        },
      });

      await invalidateUnreadBadgeCache(userId, 'personal', '');
      const orgFromData = data?.organizationId || data?.workspaceId;
      if (orgFromData) {
        await invalidateUnreadBadgeCache(userId, 'organization', String(orgFromData));
      }

      logger.info(`Notification created: ${notification._id} for user: ${userId}`);
      return clientN;
    } catch (error) {
      logger.error('Error creating notification:', error);
      throw new Error(`Error creating notification: ${error.message}`);
    }
  }

  async createBulkNotifications(userIds, notificationData) {
    try {
      const { type, title, content, data, actionUrl } = notificationData;

      const enc = isEncryptionEnabled();
      const notifications = userIds.map((userId) => ({
        userId,
        type,
        title: encText(title),
        content: encText(content),
        data: data || {},
        actionUrl: actionUrl != null ? encText(actionUrl) : null,
        ...(enc ? { encV: 1 } : {}),
      }));

      const created = await Notification.insertMany(notifications);

      const clientList = created.map((n) => toClientNotification(n));

      await emitRealtimeEvent({
        event: 'notification:bulk_new',
        userIds: userIds.map((id) => String(id)),
        payload: {
          notifications: clientList,
          timestamp: new Date().toISOString(),
        },
      });

      const orgFromData = data?.organizationId || data?.workspaceId;
      await Promise.all(
        userIds.map((uid) =>
          emitUnreadSnapshots(
            uid,
            orgFromData
              ? [
                  { scope: 'personal' },
                  { scope: 'organization', organizationId: String(orgFromData) },
                ]
              : [{ scope: 'personal' }]
          )
        )
      );

      logger.info(`Bulk notifications created: ${created.length} notifications`);
      return clientList;
    } catch (error) {
      logger.error('Error creating bulk notifications:', error);
      throw new Error(`Error creating bulk notifications: ${error.message}`);
    }
  }

  async getUserNotifications(userId, options = {}) {
    try {
      const {
        isRead,
        type,
        organizationId,
        scope,
        page = 1,
        limit = 50,
        before,
        fields = 'summary',
      } = options;
      const dtoOpts = { fields: fields === 'full' ? 'full' : 'summary' };

      const filter = { userId };
      if (isRead !== undefined) filter.isRead = isRead;
      if (type) filter.type = type;

      const scopeFilter = buildScopeMongoFilter(scope);
      const orgIdFilter = organizationId
        ? {
            $or: [
              { 'data.organizationId': String(organizationId) },
              { 'data.workspaceId': String(organizationId) },
            ],
          }
        : null;

      const andParts = [];
      if (scopeFilter) andParts.push(scopeFilter);
      if (orgIdFilter) andParts.push(orgIdFilter);
      if (andParts.length === 1) {
        Object.assign(filter, andParts[0]);
      } else if (andParts.length > 1) {
        filter.$and = andParts;
      }

      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
      const beforeRaw = before != null && before !== '' ? String(before).trim() : '';
      const beforeDate = beforeRaw ? new Date(beforeRaw) : null;
      const useBeforePagination =
        beforeDate && !Number.isNaN(beforeDate.getTime());

      const listFilter = { ...filter };
      if (useBeforePagination) {
        listFilter.createdAt = { $lt: beforeDate };
      }

      const notifications = await Notification.find(listFilter)
        .sort({ createdAt: -1 })
        .limit(limitNum)
        .skip(
          useBeforePagination
            ? 0
            : (Math.max(1, parseInt(page, 10) || 1) - 1) * limitNum
        );

      for (const n of notifications) {
        await maybeMigrateNotification(n);
      }

      const total = useBeforePagination
        ? null
        : await Notification.countDocuments(filter);
      const unreadFilter = { ...filter, isRead: false };
      const canCacheUnread =
        !useBeforePagination &&
        isRead === undefined &&
        !type &&
        (parseInt(page, 10) || 1) === 1;

      let unreadCount = null;
      if (canCacheUnread) {
        unreadCount = await getCachedUnreadCount(userId, scope, organizationId);
      }
      if (unreadCount == null) {
        unreadCount = await Notification.countDocuments(unreadFilter);
        if (canCacheUnread) {
          await setCachedUnreadCount(userId, scope, organizationId, unreadCount);
        }
      }

      const mapped = notifications.map((n) => toClientNotification(n, dtoOpts));
      const hasMore = mapped.length >= limitNum;
      /** Giá trị gửi lại param `before` để lấy trang cũ hơn (sort createdAt desc). */
      const nextBefore =
        hasMore && mapped.length > 0
          ? mapped[mapped.length - 1].createdAt
          : null;

      return {
        notifications: mapped,
        totalPages: useBeforePagination ? null : Math.ceil(total / limitNum),
        currentPage: useBeforePagination
          ? null
          : Math.max(1, parseInt(page, 10) || 1),
        total,
        unreadCount,
        hasMore,
        nextBefore,
      };
    } catch (error) {
      logger.error('Error getting user notifications:', error);
      throw new Error(`Error getting user notifications: ${error.message}`);
    }
  }

  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        },
        { new: true }
      );

      if (!notification) {
        throw new Error('Notification not found');
      }

      await maybeMigrateNotification(notification);

      await emitUnreadSnapshots(userId, targetsFromNotificationDoc(notification));

      logger.info(`Notification marked as read: ${notificationId}`);
      await emitRealtimeEvent({
        event: 'notification:read',
        userId: String(userId),
        payload: {
          notificationId: String(notificationId),
          timestamp: new Date().toISOString(),
        },
      });
      return toClientNotification(notification);
    } catch (error) {
      logger.error('Error marking notification as read:', error);
      throw new Error(`Error marking notification as read: ${error.message}`);
    }
  }

  async markAllAsRead(userId) {
    try {
      const result = await Notification.updateMany(
        { userId, isRead: false },
        {
          $set: {
            isRead: true,
            readAt: new Date(),
          },
        }
      );

      logger.info(`All notifications marked as read for user: ${userId}`);
      await emitUnreadSnapshots(userId, [{ scope: 'personal' }]);
      await emitRealtimeEvent({
        event: 'notification:read_all',
        userId: String(userId),
        payload: {
          timestamp: new Date().toISOString(),
        },
      });
      return result;
    } catch (error) {
      logger.error('Error marking all notifications as read:', error);
      throw new Error(`Error marking all notifications as read: ${error.message}`);
    }
  }

  /**
   * Sau khi accept/reject kết bạn: đánh dấu đã đọc mọi thông báo friend_request / friend_accepted
   * liên quan tới counterparty (data.userId hoặc data.friendId khớp requester/accepter).
   */
  /**
   * Sau khi host duyệt/từ chối yêu cầu vào phòng voice: đánh dấu đã đọc thông báo meeting + voice_room_join_request.
   */
  async markVoiceRoomJoinRequestRead(userId, { roomId, requestId, requestUserId }) {
    try {
      const uid = new mongoose.Types.ObjectId(String(userId));
      const rid = String(roomId || '').trim();
      if (!rid) {
        throw new Error('roomId is required');
      }

      const filter = {
        userId: uid,
        isRead: false,
        type: 'meeting',
        'data.kind': 'voice_room_join_request',
        'data.roomId': rid,
      };
      if (requestId) {
        filter['data.requestId'] = String(requestId);
      } else if (requestUserId) {
        filter['data.requestUserId'] = String(requestUserId);
      }

      const docs = await Notification.find(filter).select('_id').lean();
      const ids = docs.map((d) => String(d._id));

      if (ids.length === 0) {
        return { modifiedCount: 0, notificationIds: [] };
      }

      await Notification.updateMany(
        { _id: { $in: docs.map((d) => d._id) } },
        { $set: { isRead: true, readAt: new Date(), 'data.resolved': true } }
      );

      await emitRealtimeEvent({
        event: 'notification:read_many',
        userId: String(userId),
        payload: {
          notificationIds: ids,
          timestamp: new Date().toISOString(),
        },
      });

      await emitUnreadSnapshots(userId, [{ scope: 'personal' }]);

      return { modifiedCount: ids.length, notificationIds: ids };
    } catch (error) {
      logger.error('Error marking voice room join request notifications read:', error);
      throw new Error(`Error marking voice room join request notifications read: ${error.message}`);
    }
  }

  async markFriendRelatedRead(userId, counterpartyId) {
    try {
      const uid = new mongoose.Types.ObjectId(String(userId));
      const cp = String(counterpartyId).trim();
      if (!cp) {
        throw new Error('counterpartyId is required');
      }

      const cpVariants = [cp];
      if (mongoose.Types.ObjectId.isValid(cp)) {
        cpVariants.push(new mongoose.Types.ObjectId(cp));
      }

      const filter = {
        userId: uid,
        isRead: false,
        type: { $in: ['friend_request', 'friend_accepted'] },
        $or: [
          { 'data.userId': { $in: cpVariants } },
          { 'data.friendId': { $in: cpVariants } },
        ],
      };

      const docs = await Notification.find(filter).select('_id').lean();
      const ids = docs.map((d) => String(d._id));

      if (ids.length === 0) {
        return { modifiedCount: 0, notificationIds: [] };
      }

      await Notification.updateMany(
        { _id: { $in: docs.map((d) => d._id) } },
        { $set: { isRead: true, readAt: new Date() } }
      );

      logger.info(
        `Friend-related notifications marked read for user ${userId}: ${ids.length} (counterparty ${cp})`
      );

      await emitRealtimeEvent({
        event: 'notification:read_many',
        userId: String(userId),
        payload: {
          notificationIds: ids,
          timestamp: new Date().toISOString(),
        },
      });

      await emitUnreadSnapshots(userId, [{ scope: 'personal' }]);

      return { modifiedCount: ids.length, notificationIds: ids };
    } catch (error) {
      logger.error('Error marking friend-related notifications read:', error);
      throw new Error(`Error marking friend-related notifications read: ${error.message}`);
    }
  }

  async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        userId,
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      logger.info(`Notification deleted: ${notificationId}`);
      if (!notification.isRead) {
        await emitUnreadSnapshots(userId, targetsFromNotificationDoc(notification));
      }
      await emitRealtimeEvent({
        event: 'notification:deleted',
        userId: String(userId),
        payload: {
          notificationId: String(notificationId),
          timestamp: new Date().toISOString(),
        },
      });
      return toClientNotification(notification);
    } catch (error) {
      logger.error('Error deleting notification:', error);
      throw new Error(`Error deleting notification: ${error.message}`);
    }
  }

  async deleteAllRead(userId) {
    try {
      const result = await Notification.deleteMany({
        userId,
        isRead: true,
      });

      logger.info(`All read notifications deleted for user: ${userId}`);
      await emitRealtimeEvent({
        event: 'notification:deleted_read_all',
        userId: String(userId),
        payload: {
          timestamp: new Date().toISOString(),
        },
      });
      return result;
    } catch (error) {
      logger.error('Error deleting all read notifications:', error);
      throw new Error(`Error deleting all read notifications: ${error.message}`);
    }
  }
}

module.exports = new NotificationService();
