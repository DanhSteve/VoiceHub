const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const userContext = require('../middlewares/userContext');
const internalServiceAuth = require('../middlewares/internalServiceAuth');

// Presence từ socket-service (trước userContext — không cần x-user-id)
router.patch(
  '/internal/status',
  internalServiceAuth,
  userController.patchInternalStatus.bind(userController)
);

router.post(
  '/internal/presence/batch',
  internalServiceAuth,
  userController.internalPresenceBatch.bind(userController)
);

// Apply user context middleware cho các route còn lại
router.use(userContext);

// Tạo user profile mới
router.post('/', userController.createUserProfile.bind(userController));

// Lấy thông tin user hiện tại
router.get('/me', userController.getCurrentUser.bind(userController));

// Cập nhật status (phải trước /:userId vì /me/status có thể bị :userId match)
router.patch('/me/status', userController.updateStatus.bind(userController));

// Cập nhật user profile
router.patch('/me', userController.updateUserProfile.bind(userController));

// Tìm kiếm users
router.get('/search', userController.searchUsers.bind(userController));

// Lấy user profile theo số điện thoại
router.get('/phone/:phone', userController.getUserProfileByPhone.bind(userController));

// Lấy user profile theo username
router.get('/username/:username', userController.getUserProfileByUsername.bind(userController));

// Lấy user profile theo ID
router.get('/:userId', userController.getUserProfileById.bind(userController));

// Cập nhật user profile
router.put('/:userId', userController.updateUserProfile.bind(userController));

// Xóa user profile
router.delete('/:userId', userController.deleteUserProfile.bind(userController));

module.exports = router;



