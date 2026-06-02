const roleService = require('../services/role.service');
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

class RoleController {
  // Tạo role mới
  async createRole(req, res) {
    try {
      const { name, serverId, organizationId, permissions, color, isDefault, priority } = req.body;

      if (!name || !serverId || !organizationId) {
        return res.status(400).json({
          success: false,
          message: 'name, serverId and organizationId are required',
        });
      }

      const role = await roleService.createRole({
        name,
        serverId,
        organizationId,
        permissions,
        color,
        isDefault,
        priority,
      });

      res.status(201).json({
        success: true,
        data: role,
      });
    } catch (error) {
      logger.error('Create role error:', error);
      return sendError(res, error, 400, 'Không thể tạo vai trò', 'ROLE_CREATE_FAILED');
    }
  }

  // Lấy role theo ID
  async getRoleById(req, res) {
    try {
      const { roleId } = req.params;
      const role = await roleService.getRoleById(roleId);

      if (!role) {
        return res.status(404).json({
          success: false,
          message: 'Role not found',
        });
      }

      res.json({
        success: true,
        data: role,
      });
    } catch (error) {
      logger.error('Get role error:', error);
      return sendError(res, error, 500, 'Không thể tải vai trò', 'ROLE_GET_FAILED');
    }
  }

  // Lấy danh sách roles trong server
  async getRolesByServer(req, res) {
    try {
      const { serverId } = req.params;
      const roles = await roleService.getRolesByServer(serverId);

      res.json({
        success: true,
        data: roles,
      });
    } catch (error) {
      logger.error('Get roles error:', error);
      return sendError(res, error, 500, 'Không thể tải danh sách vai trò', 'ROLE_LIST_FAILED');
    }
  }

  // Gán role cho user
  async assignRoleToUser(req, res) {
    try {
      const { userId, serverId, roleId } = req.body;
      const assignedBy = req.user?.id || req.userContext?.userId;

      if (!userId || !serverId || !roleId) {
        return res.status(400).json({
          success: false,
          message: 'userId, serverId and roleId are required',
        });
      }

      const userRole = await roleService.assignRoleToUser(userId, serverId, roleId, assignedBy);

      res.status(201).json({
        success: true,
        data: userRole,
      });
    } catch (error) {
      logger.error('Assign role error:', error);
      return sendError(res, error, 400, 'Không thể gán vai trò', 'ROLE_ASSIGN_FAILED');
    }
  }

  // Xóa role khỏi user
  async removeRoleFromUser(req, res) {
    try {
      const { userId, serverId, roleId } = req.body;

      if (!userId || !serverId || !roleId) {
        return res.status(400).json({
          success: false,
          message: 'userId, serverId and roleId are required',
        });
      }

      const userRole = await roleService.removeRoleFromUser(userId, serverId, roleId);

      res.json({
        success: true,
        data: userRole,
      });
    } catch (error) {
      logger.error('Remove role error:', error);
      return sendError(res, error, 400, 'Không thể gỡ vai trò', 'ROLE_REMOVE_FAILED');
    }
  }

  // Lấy roles của user trong server
  async getUserRoles(req, res) {
    try {
      const { userId, serverId } = req.params;
      const roles = await roleService.getUserRoles(userId, serverId);

      res.json({
        success: true,
        data: roles,
      });
    } catch (error) {
      logger.error('Get user roles error:', error);
      return sendError(res, error, 500, 'Không thể tải vai trò người dùng', 'ROLE_USER_LIST_FAILED');
    }
  }

  // Cập nhật role
  async updateRole(req, res) {
    try {
      const { roleId } = req.params;
      const role = await roleService.updateRole(roleId, req.body);

      res.json({
        success: true,
        data: role,
      });
    } catch (error) {
      logger.error('Update role error:', error);
      return sendError(res, error, 400, 'Không thể cập nhật vai trò', 'ROLE_UPDATE_FAILED');
    }
  }

  // Xóa role
  async deleteRole(req, res) {
    try {
      const { roleId } = req.params;
      const role = await roleService.deleteRole(roleId);

      res.json({
        success: true,
        message: 'Role deleted successfully',
        data: role,
      });
    } catch (error) {
      logger.error('Delete role error:', error);
      return sendError(res, error, 400, 'Không thể xóa vai trò', 'ROLE_DELETE_FAILED');
    }
  }

  async purgeByServerContext(req, res) {
    try {
      const { serverId } = req.params;
      const data = await roleService.purgeByServerContext(serverId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('purgeByServerContext error:', error);
      return sendError(res, error, 400, 'Không thể dọn dữ liệu vai trò', 'ROLE_PURGE_FAILED');
    }
  }

  async backfillRoleRead(req, res) {
    try {
      const serverId = req.params?.serverId || req.body?.serverId || req.body?.organizationId || null;
      const data = await roleService.backfillRoleReadPermission(serverId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('backfillRoleRead error:', error);
      return sendError(res, error, 500, 'Không thể backfill quyền role:read', 'ROLE_BACKFILL_FAILED');
    }
  }
}

module.exports = new RoleController();

