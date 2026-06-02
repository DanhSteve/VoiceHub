const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notification.controller');
const internalNotificationAuth = require('../middlewares/internalNotificationAuth');
const requireUser = require('../middlewares/requireUser');

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

// Lấy notifications của user (bắt buộc JWT qua gateway)
router.get('/', requireUser, notificationController.getUserNotifications.bind(notificationController));
router.get('/user/:userId', requireUser, notificationController.getUserNotifications.bind(notificationController));

// Đánh dấu đã đọc thông báo kết bạn theo counterparty (đặt trước /:notificationId/read)
router.patch(
  '/read-friend-related',
  requireUser,
  notificationController.markFriendRelatedRead.bind(notificationController)
);

router.patch(
  '/read-voice-room-join-request',
  requireUser,
  notificationController.markVoiceRoomJoinRequestRead.bind(notificationController)
);

router.patch(
  '/internal/read-voice-room-join-request',
  internalNotificationAuth,
  notificationController.markVoiceRoomJoinRequestReadInternal.bind(notificationController)
);

// Đánh dấu notification là đã đọc
router.patch('/:notificationId/read', requireUser, notificationController.markAsRead.bind(notificationController));

// Đánh dấu tất cả notifications là đã đọc
router.patch('/read-all', requireUser, notificationController.markAllAsRead.bind(notificationController));

// Xóa notification
router.delete('/:notificationId', requireUser, notificationController.deleteNotification.bind(notificationController));

// Xóa tất cả notifications đã đọc
router.delete('/read/all', requireUser, notificationController.deleteAllRead.bind(notificationController));

module.exports = router;



