const express = require('express');
const router = express.Router();
const messageController = require('../controllers/message.controller');
const { authenticate } = require('/shared/middleware/auth');

const CHAT_INTERNAL_TOKEN = process.env.CHAT_INTERNAL_TOKEN || '';

function internalServiceOnly(req, res, next) {
  const token = req.headers['x-internal-token'] || req.headers['x-chat-internal-token'];
  if (!CHAT_INTERNAL_TOKEN || token !== CHAT_INTERNAL_TOKEN) {
    return res.status(403).json({
      success: false,
      message: 'Forbidden',
    });
  }
  next();
}

// Service-to-service: xóa DM khi hủy kết bạn (trước authenticate JWT)
router.post(
  '/internal/dm/delete-between',
  internalServiceOnly,
  messageController.deleteDmBetweenUsers.bind(messageController)
);

router.get(
  '/internal/messages/:messageId',
  internalServiceOnly,
  messageController.getMessageInternal.bind(messageController)
);

router.patch(
  '/internal/messages/:messageId/file-promoted',
  internalServiceOnly,
  messageController.promoteMessageFileInternal.bind(messageController)
);

router.get(
  '/internal/storage/signed-read',
  internalServiceOnly,
  messageController.getSignedReadUrlInternal.bind(messageController)
);

// Tất cả routes đều cần authentication
router.use(authenticate);

// Signed upload URL (Firebase) — đặt trước POST /
router.post(
  '/storage/signed-upload',
  messageController.createSignedUploadUrl.bind(messageController)
);

// Tạo tin nhắn mới
router.post('/', messageController.createMessage.bind(messageController));

// Thống kê (đặt trước /:messageId để không bị nuốt bởi param)
router.get('/stats/summary', messageController.getMessageStatsSummary.bind(messageController));

// Tin chưa đọc — kênh tổ chức
router.get('/unread/org', messageController.getUnreadOrgMessagesFeed.bind(messageController));

// Tìm kiếm tin kênh tổ chức (đặt trước /:messageId)
router.get('/search', messageController.searchMessages.bind(messageController));

// Lấy danh sách tin nhắn
router.get('/', messageController.getMessages.bind(messageController));

// Lấy tin nhắn theo ID
router.get('/:messageId', messageController.getMessageById.bind(messageController));

// Đánh dấu tin nhắn đã đọc
router.patch('/:messageId/read', messageController.markAsRead.bind(messageController));

// Xóa tin nhắn (soft delete)
router.delete('/:messageId', messageController.deleteMessage.bind(messageController));

// Thu hồi tin nhắn (recall)
router.patch('/:messageId/recall', messageController.recallMessage.bind(messageController));

// Chỉnh sửa tin nhắn
router.patch('/:messageId/edit', messageController.editMessage.bind(messageController));

// Alias tương thích: một số client cũ gọi PATCH /messages/:id
router.patch('/:messageId', messageController.editMessage.bind(messageController));

module.exports = router;

