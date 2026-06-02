const permissionService = require('../services/permission.service');
const { logger } = require('/shared');

function sendError(res, err, fallbackStatus, fallbackMessage, fallbackCode) {
  const status = Number(err?.statusCode) || fallbackStatus;
  const message = String(err?.message || fallbackMessage);
  const errorCode = String(err?.errorCode || fallbackCode || '').trim();
  return res.status(status).json({
    success: false,
    message,
    ...(errorCode ? { errorCode } : {}),
    messageUser: message,
  });
}

class PermissionController {
  // Kiểm tra quyền truy cập (cho API Gateway)
  async checkPermission(req, res) {
    try {
      const { userId, serverId, action } = req.body;

      if (!userId || !serverId || !action) {
        return res.status(400).json({
          success: false,
          message: 'userId, serverId and action are required',
        });
      }

      const result = await permissionService.checkPermission(userId, serverId, action);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Check permission error:', error);
      return sendError(res, error, 500, 'Không thể kiểm tra quyền truy cập', 'PERMISSION_CHECK_FAILED');
    }
  }

  // Lấy permissions của user trong server
  async getUserPermissions(req, res) {
    try {
      const { userId, serverId } = req.params;
      const permissions = await permissionService.getUserPermissions(userId, serverId);

      res.json({
        success: true,
        data: permissions,
      });
    } catch (error) {
      logger.error('Get user permissions error:', error);
      return sendError(res, error, 500, 'Không thể tải quyền người dùng', 'PERMISSION_GET_FAILED');
    }
  }

  // Lấy role của user trong server (cho API Gateway)
  async getUserRole(req, res) {
    try {
      const { userId, serverId } = req.params;
      const role = await permissionService.getUserRole(userId, serverId);

      res.json({
        success: true,
        data: role,
      });
    } catch (error) {
      logger.error('Get user role error:', error);
      return sendError(res, error, 500, 'Không thể tải vai trò người dùng', 'PERMISSION_ROLE_FAILED');
    }
  }
}

module.exports = new PermissionController();

