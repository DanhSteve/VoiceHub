const express = require('express');
const router = express.Router();
const authenticateOrInternal = require('../middleware/authenticateOrInternal');
const roleController = require('../controllers/role.controller');

router.use(authenticateOrInternal);

// Tạo role mới
router.post('/', roleController.createRole.bind(roleController));

// Lấy danh sách roles trong server
router.get('/server/:serverId', roleController.getRolesByServer.bind(roleController));

// Lấy role theo ID
router.get('/:roleId', roleController.getRoleById.bind(roleController));

// Gán role cho user
router.post('/assign', roleController.assignRoleToUser.bind(roleController));

// Xóa role khỏi user
router.post('/remove', roleController.removeRoleFromUser.bind(roleController));

// Lấy roles của user trong server
router.get('/user/:userId/server/:serverId', roleController.getUserRoles.bind(roleController));

// Cập nhật role
router.patch('/:roleId', roleController.updateRole.bind(roleController));
router.put('/:roleId', roleController.updateRole.bind(roleController));

// Xóa role
router.delete('/:roleId', roleController.deleteRole.bind(roleController));

module.exports = router;



