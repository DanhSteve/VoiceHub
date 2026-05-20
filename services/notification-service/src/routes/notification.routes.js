const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const internalNotificationAuth = require('../middlewares/internalNotificationAuth');

// Tạo notification mới (chỉ service nội bộ / webhook)
router.post(
  '/',
  internalNotificationAuth,
  notificationController.createNotification.bind(notificationController)
);

// Tạo nhiều notifications
router.post(
  '/bulk',
  internalNotificationAuth,
  notificationController.createBulkNotifications.bind(notificationController)
);

// Lấy notifications của user
router.get('/', notificationController.getUserNotifications.bind(notificationController));
router.get('/user/:userId', notificationController.getUserNotifications.bind(notificationController));

// Đánh dấu đã đọc thông báo kết bạn theo counterparty (đặt trước /:notificationId/read)
router.patch(
  '/read-friend-related',
  notificationController.markFriendRelatedRead.bind(notificationController)
);

// Đánh dấu notification là đã đọc
router.patch('/:notificationId/read', notificationController.markAsRead.bind(notificationController));

// Đánh dấu tất cả notifications là đã đọc
router.patch('/read-all', notificationController.markAllAsRead.bind(notificationController));

// Xóa notification
router.delete('/:notificationId', notificationController.deleteNotification.bind(notificationController));

// Xóa tất cả notifications đã đọc
router.delete('/read/all', notificationController.deleteAllRead.bind(notificationController));

module.exports = router;



