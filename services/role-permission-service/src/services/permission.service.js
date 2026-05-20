const UserRole = require('../models/UserRole');
const Role = require('../models/Role');
const { getRedisClient, logger } = require('/shared');
const axios = require('axios');

const ORGANIZATION_SERVICE_URL = process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013';

function isTestUnlockEnabled() {
  return String(process.env.RBAC_TEST_UNLOCK || '').trim().toLowerCase() === 'true';
}

class PermissionService {
  // Kiểm tra quyền truy cập
  async checkPermission(userId, serverId, action) {
    try {
      if (isTestUnlockEnabled()) {
        return {
          allowed: true,
          reason: null,
        };
      }

      // Kiểm tra cache trước
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `permissions:${userId}:${serverId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          const permissions = JSON.parse(cached);
          const allowed = this.hasPermission(permissions, action);
          return {
            allowed,
            reason: allowed ? null : 'Insufficient permissions',
          };
        }
      }

      // Lấy roles của user trong server
      const userRoles = await UserRole.find({
        userId,
        serverId,
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ],
      }).populate('roleId');

      // Lấy tất cả permissions từ các roles
      const allPermissions = [];
      for (const userRole of userRoles) {
        if (userRole.roleId && userRole.roleId.permissions) {
          allPermissions.push(...userRole.roleId.permissions);
        }
      }

      // Kiểm tra quyền
      const allowed = this.hasPermission(allPermissions, action);

      // Cache permissions
      if (redis) {
        const cacheKey = `permissions:${userId}:${serverId}`;
        await redis.setex(cacheKey, 300, JSON.stringify(allPermissions)); // 5 minutes
      }

      return {
        allowed,
        reason: allowed ? null : 'Insufficient permissions',
      };
    } catch (error) {
      logger.error('Error checking permission:', error);
      return {
        allowed: false,
        reason: 'Permission check failed',
      };
    }
  }

  // Kiểm tra user có permission không
  hasPermission(permissions, action) {
    if (!permissions || permissions.length === 0) {
      return false;
    }

    // Parse action: "chat:read" -> { resource: "chat", action: "read" }
    const [resource, actionType] = action.split(':');

    for (const perm of permissions) {
      if (perm.resource === resource || perm.resource === '*') {
        if (
          perm.actions.includes(actionType) ||
          perm.actions.includes('*') ||
          perm.actions.includes('admin')
        ) {
          return true;
        }
      }
    }

    return false;
  }

  // Lấy tất cả permissions của user trong server
  async getUserPermissions(userId, serverId) {
    try {
      if (isTestUnlockEnabled()) {
        return [{ resource: '*', actions: ['*'] }];
      }

      const userRoles = await UserRole.find({
        userId,
        serverId,
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ],
      }).populate('roleId');

      const allPermissions = [];
      for (const userRole of userRoles) {
        if (userRole.roleId && userRole.roleId.permissions) {
          allPermissions.push(...userRole.roleId.permissions);
        }
      }

      return allPermissions;
    } catch (error) {
      logger.error('Error getting user permissions:', error);
      throw new Error(`Error getting user permissions: ${error.message}`);
    }
  }

  // Lấy role của user trong server (cho API Gateway)
  async getUserRole(userId, serverId) {
    try {
      if (isTestUnlockEnabled()) {
        return {
          name: 'RBAC Test Unlock',
          permissions: [{ resource: '*', actions: ['*'] }],
          color: '#22c55e',
          priority: 9999,
          isDefault: false,
        };
      }

      const userRoles = await UserRole.find({
        userId,
        serverId,
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ],
      })
        .populate('roleId', 'name permissions color')
        .sort({ 'roleId.priority': -1 })
        .limit(1);

      if (userRoles.length === 0) {
        return null;
      }

      return userRoles[0].roleId;
    } catch (error) {
      logger.error('Error getting user role:', error);
      return null;
    }
  }
}

module.exports = new PermissionService();

