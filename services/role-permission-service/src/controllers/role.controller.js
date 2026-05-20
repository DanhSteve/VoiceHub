const roleService = require('../services/role.service');
const { logger } = require('/shared');

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
      res.status(400).json({
        success: false,
        message: error.message,
      });
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
      res.status(500).json({
        success: false,
        message: error.message,
      });
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
      res.status(500).json({
        success: false,
        message: error.message,
      });
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
      res.status(400).json({
        success: false,
        message: error.message,
      });
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
      res.status(400).json({
        success: false,
        message: error.message,
      });
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
      res.status(500).json({
        success: false,
        message: error.message,
      });
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
      res.status(400).json({
        success: false,
        message: error.message,
      });
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
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  async purgeByServerContext(req, res) {
    try {
      const { serverId } = req.params;
      const data = await roleService.purgeByServerContext(serverId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('purgeByServerContext error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = new RoleController();

