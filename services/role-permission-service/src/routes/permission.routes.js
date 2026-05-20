const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');
const internalGatewayAuth = require('../middleware/internalGatewayAuth');
const authenticateOrInternal = require('../middleware/authenticateOrInternal');

// Kiểm tra quyền truy cập (chỉ API Gateway — header nội bộ)
router.post(
  '/check',
  internalGatewayAuth,
  permissionController.checkPermission.bind(permissionController)
);

// Lấy permissions của user trong server
router.get(
  '/user/:userId/server/:serverId',
  authenticateOrInternal,
  permissionController.getUserPermissions.bind(permissionController)
);

// Lấy role của user trong server
router.get(
  '/user/:userId/server/:serverId/role',
  authenticateOrInternal,
  permissionController.getUserRole.bind(permissionController)
);

module.exports = router;



