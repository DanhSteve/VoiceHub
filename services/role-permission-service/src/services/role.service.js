const { mongoose } = require('/shared/config/mongo');
const Role = require('../models/Role');
const UserRole = require('../models/UserRole');
const { getRedisClient, roleWebhook, logger } = require('/shared');
const axios = require('axios');

const ORGANIZATION_SERVICE_URL = (process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013').replace(
  /\/$/,
  ''
);
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

/** Role gắn vị trí cây tổ chức (tag div_/dep_/team_ hoặc nhãn Khối/Phòng/Team). */
function isHierarchyRoleName(name) {
  const lower = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Hỗ trợ cả id dài (ObjectId 24 chars) và slug scope bất kỳ.
  if (/(?:^|\s|[•·_-])(div|dep|team)_[a-z0-9_-]{6,}\b/.test(lower)) return true;
  if (/^(khoi|khối|phong ban|phòng ban|phong|phòng|team|chi nhanh|chi nhánh)\b/.test(lower)) return true;
  if (/\b(khoi|khối|phong ban|phòng ban|phong|phòng|team)\s*:/.test(lower)) return true;
  return false;
}

function internalOrgHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(GATEWAY_INTERNAL_TOKEN ? { 'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN } : {}),
  };
}

/** serverId trong RBAC = organizationId (không có /api/servers trên organization-service). */
async function fetchOrganizationDisplayName(serverId, role) {
  const orgId = String(role?.organizationId || serverId || '').trim();
  if (!orgId) return 'Organization';
  if (!GATEWAY_INTERNAL_TOKEN) return 'Organization';
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/org/${encodeURIComponent(orgId)}/summary`,
      { headers: internalOrgHeaders(), timeout: 5000, validateStatus: () => true }
    );
    if (res.status === 200) {
      return res.data?.data?.name || res.data?.name || 'Organization';
    }
  } catch (e) {
    logger.warn('[role.service] fetchOrganizationDisplayName failed', e.message);
  }
  return 'Organization';
}

async function syncOrgMembershipPlacement(userId, organizationId) {
  if (!GATEWAY_INTERNAL_TOKEN || !userId || !organizationId) {
    return {
      attempted: false,
      success: false,
      reason: 'missing_internal_token_or_ids',
    };
  }
  try {
    const res = await axios.post(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/sync-membership-placement`,
      { userId: String(userId), organizationId: String(organizationId) },
      {
        headers: internalOrgHeaders(),
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    const ok = res.status >= 200 && res.status < 300 && res.data?.success !== false;
    if (!ok) {
      logger.warn('[role.service] syncOrgMembershipPlacement non-2xx', {
        status: res.status,
        userId: String(userId),
        organizationId: String(organizationId),
        message: res.data?.message,
      });
    }
    return {
      attempted: true,
      success: ok,
      status: res.status,
      message: res.data?.message || '',
      data: res.data?.data || null,
    };
  } catch (e) {
    logger.warn('[role.service] syncOrgMembershipPlacement failed', e.message);
    return {
      attempted: true,
      success: false,
      reason: 'request_failed',
      message: e.message,
    };
  }
}

class RoleService {
  // Tạo role mới
  async createRole(roleData) {
    try {
      const { name, serverId, organizationId, permissions, color, isDefault, priority } = roleData;

      // Kiểm tra role name đã tồn tại trong server chưa
      const existingRole = await Role.findOne({ name, serverId });
      if (existingRole) {
        throw new Error('Role name already exists in this server');
      }

      const role = new Role({
        name,
        serverId,
        organizationId,
        permissions: permissions || [],
        color: color || '#5865F2',
        isDefault: isDefault || false,
        priority: priority || 0,
      });

      await role.save();

      // Cache role
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `role:${role._id}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(role));
      }

      logger.info(`Role created: ${role._id}`);
      return role;
    } catch (error) {
      logger.error('Error creating role:', error);
      throw new Error(`Error creating role: ${error.message}`);
    }
  }

  // Lấy role theo ID
  async getRoleById(roleId) {
    try {
      const role = await Role.findById(roleId);
      return role;
    } catch (error) {
      logger.error('Error getting role:', error);
      throw new Error(`Error getting role: ${error.message}`);
    }
  }

  // Lấy danh sách roles trong server (hoặc theo organizationId nếu client truyền org id)
  async getRolesByServer(serverId) {
    try {
      const roles = await Role.find({
        isActive: true,
        $or: [{ serverId }, { organizationId: serverId }],
      }).sort({ priority: -1, createdAt: 1 });

      return roles;
    } catch (error) {
      logger.error('Error getting roles:', error);
      throw new Error(`Error getting roles: ${error.message}`);
    }
  }

  // Gán role cho user
  async assignRoleToUser(userId, serverId, roleId, assignedBy) {
    try {
      // Kiểm tra role tồn tại
      const role = await Role.findById(roleId);
      if (!role || role.serverId.toString() !== serverId.toString()) {
        throw new Error('Role not found or invalid for this server');
      }

      // Kiểm tra đã có role chưa
      const existing = await UserRole.findOne({ userId, serverId, roleId });
      const isHierarchyRole = isHierarchyRoleName(role.name);
      if (existing) {
        logger.info(`Role already assigned (idempotent): user ${userId}, role ${roleId}, server ${serverId}`);
        const placementSync = isHierarchyRole
          ? await syncOrgMembershipPlacement(userId, serverId)
          : {
              attempted: false,
              success: true,
              reason: 'non_hierarchy_role',
            };
        return {
          userRole: existing,
          roleName: role.name,
          hierarchyRole: isHierarchyRole,
          placementSync,
          idempotent: true,
        };
      }

      const userRole = new UserRole({
        userId,
        serverId,
        roleId,
        assignedBy,
      });

      await userRole.save();

      // Xóa cache permission
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `permissions:${userId}:${serverId}`;
        await redis.del(cacheKey);
      }

      logger.info(`Role assigned: user ${userId}, role ${roleId}, server ${serverId}`);
      const placementSync = isHierarchyRole
        ? await syncOrgMembershipPlacement(userId, serverId)
        : {
            attempted: false,
            success: true,
            reason: 'non_hierarchy_role',
          };
      return {
        userRole,
        roleName: role.name,
        hierarchyRole: isHierarchyRole,
        placementSync,
        idempotent: false,
      };
    } catch (error) {
      logger.error('Error assigning role:', error);
      throw new Error(`Error assigning role: ${error.message}`);
    }
  }

  // Xóa role khỏi user
  async removeRoleFromUser(userId, serverId, roleId) {
    try {
      const userRole = await UserRole.findOneAndDelete({
        userId,
        serverId,
        roleId,
      });

      if (!userRole) {
        throw new Error('User role not found');
      }

      // Xóa cache permission
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `permissions:${userId}:${serverId}`;
        await redis.del(cacheKey);
      }

      let removedRole = null;
      try {
        removedRole = await Role.findById(roleId);
      } catch {
        /* ignore */
      }

      try {
        const role = removedRole || (await Role.findById(roleId));
        if (role?.name) {
          const orgId = String(role.organizationId || serverId || '');
          const serverName = await fetchOrganizationDisplayName(serverId, role);
          await roleWebhook.removed(
            userId.toString(),
            role.name,
            serverId.toString(),
            serverName,
            null,
            orgId || undefined
          );
        }
      } catch (error) {
        logger.warn('[role.service] role removed webhook skipped:', error.message);
      }

      logger.info(`Role removed: user ${userId}, role ${roleId}, server ${serverId}`);
      const isHierarchyRole = Boolean(removedRole && isHierarchyRoleName(removedRole.name));
      const placementSync = isHierarchyRole
        ? await syncOrgMembershipPlacement(userId, serverId)
        : {
            attempted: false,
            success: true,
            reason: 'non_hierarchy_role',
          };
      return {
        userRole,
        roleName: removedRole?.name || '',
        hierarchyRole: isHierarchyRole,
        placementSync,
      };
    } catch (error) {
      logger.error('Error removing role:', error);
      throw new Error(`Error removing role: ${error.message}`);
    }
  }

  // Lấy roles của user trong server
  async getUserRoles(userId, serverId) {
    try {
      const userRoles = await UserRole.find({
        userId,
        serverId,
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ],
      }).populate('roleId');

      return userRoles.map((ur) => ur.roleId);
    } catch (error) {
      logger.error('Error getting user roles:', error);
      throw new Error(`Error getting user roles: ${error.message}`);
    }
  }

  // Cập nhật role
  async updateRole(roleId, updateData) {
    try {
      const allowedFields = ['name', 'permissions', 'color', 'priority', 'isDefault'];
      const updateFields = {};

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      }

      const role = await Role.findByIdAndUpdate(
        roleId,
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      if (!role) {
        throw new Error('Role not found');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `role:${roleId}`;
        await redis.del(cacheKey);
      }

      logger.info(`Role updated: ${roleId}`);
      return role;
    } catch (error) {
      logger.error('Error updating role:', error);
      throw new Error(`Error updating role: ${error.message}`);
    }
  }

  // Xóa role
  async deleteRole(roleId) {
    try {
      const role = await Role.findByIdAndUpdate(
        roleId,
        { $set: { isActive: false } },
        { new: true }
      );

      if (!role) {
        throw new Error('Role not found');
      }

      // Xóa tất cả user roles
      await UserRole.updateMany(
        { roleId },
        { $set: { isActive: false } }
      );

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `role:${roleId}`;
        await redis.del(cacheKey);
      }

      logger.info(`Role deleted: ${roleId}`);
      return role;
    } catch (error) {
      logger.error('Error deleting role:', error);
      throw new Error(`Error deleting role: ${error.message}`);
    }
  }

  /**
   * Xóa toàn bộ UserRole + vô hiệu hóa Role theo ngữ cảnh server/org (serverId = organizationId).
   * Gọi nội bộ khi owner xóa tổ chức.
   */
  async purgeByServerContext(serverId) {
    try {
      const sid = new mongoose.Types.ObjectId(String(serverId));
      const userRolesResult = await UserRole.deleteMany({ serverId: sid });
      const rolesResult = await Role.deleteMany({
        $or: [{ serverId: sid }, { organizationId: sid }],
      });
      logger.info(
        `purgeByServerContext: serverId=${serverId} rolesDeleted=${rolesResult.deletedCount} userRolesDeleted=${userRolesResult.deletedCount}`
      );
      return {
        deletedRoles: rolesResult.deletedCount || 0,
        deletedUserRoles: userRolesResult.deletedCount || 0,
      };
    } catch (error) {
      logger.error('Error purgeByServerContext:', error);
      throw new Error(`Error purgeByServerContext: ${error.message}`);
    }
  }
}

module.exports = new RoleService();

