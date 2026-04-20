const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const friendController = require('../controllers/friend.controller');
const friendControllerLegacy = require('../controllers/friendController');

// Bảo vệ tất cả route: gắn req.user từ auth /me
router.use(protect);

// Tìm bạn theo số điện thoại (phải đặt trước /:friendId để không bị match nhầm)
router.get('/search', friendControllerLegacy.searchByPhone);

// Backward-compatible aliases (client đang dùng các path legacy)
router.get('/pending', friendControllerLegacy.getPendingRequests);
router.post('/accept/:id', friendControllerLegacy.acceptRequest);
router.delete('/reject/:id', friendControllerLegacy.rejectRequest);
router.post('/block', friendControllerLegacy.blockUser);
router.delete('/unblock/:userId', friendControllerLegacy.unblockUser);

// Gửi lời mời kết bạn
router.post('/request', friendController.sendFriendRequest.bind(friendController));

// Chấp nhận lời mời kết bạn
router.post('/:friendId/accept', friendController.acceptFriendRequest.bind(friendController));

// Từ chối lời mời kết bạn
router.post('/:friendId/reject', friendController.rejectFriendRequest.bind(friendController));

// Lấy danh sách bạn bè
router.get('/', friendController.getFriends.bind(friendController));
router.get('/user/:userId', friendController.getFriends.bind(friendController));

// Lấy danh sách lời mời kết bạn
router.get('/requests', friendController.getFriendRequests.bind(friendController));

// Kiểm tra relationship
router.get('/:friendId/relationship', friendController.getRelationship.bind(friendController));

// Chặn user
router.post('/:friendId/block', friendController.blockUser.bind(friendController));

// Bỏ chặn user
router.post('/:friendId/unblock', friendController.unblockUser.bind(friendController));

// Xóa bạn bè
router.delete('/:friendId', friendController.removeFriend.bind(friendController));

module.exports = router;



