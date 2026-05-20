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

function toClientNotification(doc) {
  if (!doc) return null;
  const o = doc.toObject ? doc.toObject() : { ...doc };
  o.title = unwrapPlaintext(o.title);
  o.content = unwrapPlaintext(o.content);
  if (o.actionUrl) o.actionUrl = unwrapPlaintext(o.actionUrl);
  return o;
}

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

      logger.info(`Bulk notifications created: ${created.length} notifications`);
      return clientList;
    } catch (error) {
      logger.error('Error creating bulk notifications:', error);
      throw new Error(`Error creating bulk notifications: ${error.message}`);
    }
  }

  async getUserNotifications(userId, options = {}) {
    try {
      const { isRead, type, organizationId, page = 1, limit = 50 } = options;

      const filter = { userId };
      if (isRead !== undefined) filter.isRead = isRead;
      if (type) filter.type = type;
      if (organizationId) {
        filter.$or = [
          { 'data.organizationId': String(organizationId) },
          { 'data.workspaceId': String(organizationId) },
        ];
      }

      const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      for (const n of notifications) {
        await maybeMigrateNotification(n);
      }

      const total = await Notification.countDocuments(filter);
      const unreadFilter = { ...filter, isRead: false };
      const unreadCount = await Notification.countDocuments(unreadFilter);

      return {
        notifications: notifications.map((n) => toClientNotification(n)),
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
        unreadCount,
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
