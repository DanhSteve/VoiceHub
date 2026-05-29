const notificationService = require('../services/notification.service');
const { publishDispatchJob } = require('../messaging/notificationDispatch.publisher');
const { logger } = require('/shared');

function safeMessage(error, fallback) {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) return 'Hệ thống thông báo đang bận. Vui lòng thử lại sau.';
  return String(error?.message || fallback);
}

class NotificationController {
  _asyncDispatchEnabled() {
    return String(process.env.NOTIFICATION_ASYNC_DISPATCH || 'false').toLowerCase() === 'true';
  }

  // Tạo notification mới
  async createNotification(req, res) {
    try {
      const { userId, type, title, content, data, actionUrl } = req.body;

      if (!userId || !type || !title || !content) {
        return res.status(400).json({
          success: false,
          message: 'userId, type, title and content are required',
        });
      }

      if (this._asyncDispatchEnabled()) {
        await publishDispatchJob({
          kind: 'single',
          userId,
          notification: { type, title, content, data, actionUrl },
        });
        return res.status(202).json({ success: true, queued: true });
      }
      const notification = await notificationService.createNotification({
        userId,
        type,
        title,
        content,
        data,
        actionUrl,
      });

      res.status(201).json({
        success: true,
        data: notification,
      });
    } catch (error) {
      logger.error('Create notification error:', error);
      res.status(400).json({
        success: false,
        message: safeMessage(error, 'Không thể tạo thông báo'),
      });
    }
  }

  // Tạo nhiều notifications
  async createBulkNotifications(req, res) {
    try {
      const { userIds, type, title, content, data, actionUrl } = req.body;

      if (!userIds || !Array.isArray(userIds) || !type || !title || !content) {
        return res.status(400).json({
          success: false,
          message: 'userIds (array), type, title and content are required',
        });
      }

      if (this._asyncDispatchEnabled()) {
        await publishDispatchJob({
          kind: 'bulk',
          userIds,
          notification: { type, title, content, data, actionUrl },
        });
        return res.status(202).json({ success: true, queued: true });
      }
      const notifications = await notificationService.createBulkNotifications(userIds, {
        type,
        title,
        content,
        data,
        actionUrl,
      });

      res.status(201).json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      logger.error('Create bulk notifications error:', error);
      res.status(400).json({
        success: false,
        message: safeMessage(error, 'Không thể gửi thông báo hàng loạt'),
      });
    }
  }

  // Lấy notifications của user
  async getUserNotifications(req, res) {
    try {
      const authenticatedUserId = req.user?.id || req.userContext?.userId;
      if (!authenticatedUserId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const paramUserId = req.params.userId ? String(req.params.userId).trim() : null;
      if (paramUserId && paramUserId !== String(authenticatedUserId)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const userId = authenticatedUserId;
      const { isRead, type, page, limit, organizationId, scope, before, fields } =
        req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
        });
      }

      const result = await notificationService.getUserNotifications(userId, {
        isRead: isRead === 'true' ? true : isRead === 'false' ? false : undefined,
        type,
        organizationId,
        scope,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
        before: before || undefined,
        fields: fields === 'full' ? 'full' : 'summary',
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get user notifications error:', error);
      res.status(500).json({
        success: false,
        message: safeMessage(error, 'Không thể tải danh sách thông báo'),
      });
    }
  }

  // Đánh dấu đã đọc mọi thông báo kết bạn liên quan tới một user (sau accept/reject)
  async markFriendRelatedRead(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;
      const { counterpartyId } = req.body || {};

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }
      if (!counterpartyId) {
        return res.status(400).json({
          success: false,
          message: 'counterpartyId is required',
        });
      }

      const result = await notificationService.markFriendRelatedRead(userId, counterpartyId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Mark friend-related read error:', error);
      res.status(400).json({
        success: false,
        message: safeMessage(error, 'Không thể cập nhật thông báo'),
      });
    }
  }

  // Đánh dấu notification là đã đọc
  async markAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const notification = await notificationService.markAsRead(notificationId, userId);

      res.json({
        success: true,
        data: notification,
      });
    } catch (error) {
      logger.error('Mark as read error:', error);
      res.status(400).json({
        success: false,
        message: safeMessage(error, 'Không thể đánh dấu đã đọc'),
      });
    }
  }

  // Đánh dấu tất cả notifications là đã đọc
  async markAllAsRead(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await notificationService.markAllAsRead(userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Mark all as read error:', error);
      res.status(400).json({
        success: false,
        message: safeMessage(error, 'Không thể đánh dấu đã đọc toàn bộ'),
      });
    }
  }

  // Xóa notification
  async deleteNotification(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const notification = await notificationService.deleteNotification(notificationId, userId);

      res.json({
        success: true,
        data: notification,
      });
    } catch (error) {
      logger.error('Delete notification error:', error);
      res.status(400).json({
        success: false,
        message: safeMessage(error, 'Không thể xóa thông báo'),
      });
    }
  }

  // Xóa tất cả notifications đã đọc
  async deleteAllRead(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await notificationService.deleteAllRead(userId);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Delete all read error:', error);
      res.status(400).json({
        success: false,
        message: safeMessage(error, 'Không thể tải số lượng thông báo chưa đọc'),
      });
    }
  }
}

module.exports = new NotificationController();

