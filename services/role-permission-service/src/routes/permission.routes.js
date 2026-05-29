const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');
const internalGatewayAuth = require('../middleware/internalGatewayAuth');
const { authenticate } = require('/shared/middleware/auth');
const { requireRolePermission } = require('../middleware/requireRoleAccess');

// Kiểm tra quyền truy cập (chỉ API Gateway — header nội bộ)
router.post(
  '/check',
  internalGatewayAuth,
  permissionController.checkPermission.bind(permissionController)
);

// Lấy permissions của user trong server
router.get(
  '/user/:userId/server/:serverId',
  authenticate,
  requireRolePermission('role:read'),
  permissionController.getUserPermissions.bind(permissionController)
);

// Lấy role của user trong server
router.get(
  '/user/:userId/server/:serverId/role',
  authenticate,
  requireRolePermission('role:read'),
  permissionController.getUserRole.bind(permissionController)
);

module.exports = router;



