const Role = require('../models/Role');
const permissionService = require('../services/permission.service');

async function resolveOrganizationId(req) {
  const fromBody = req.body?.organizationId || req.body?.serverId;
  const fromParams = req.params?.serverId;
  const fromQuery = req.query?.organizationId || req.query?.serverId;
  if (fromBody || fromParams || fromQuery) {
    return String(fromBody || fromParams || fromQuery).trim();
  }
  const roleId = req.params?.roleId;
  if (roleId) {
    const role = await Role.findById(roleId).select('organizationId serverId').lean();
    if (role) {
      return String(role.organizationId || role.serverId || '').trim();
    }
  }
  return null;
}

function requireRolePermission(action) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const paramUserId = req.params?.userId ? String(req.params.userId).trim() : null;
      if (paramUserId && paramUserId === String(userId) && action === 'role:read') {
        const organizationId = await resolveOrganizationId(req);
        if (organizationId) {
          req.roleOrgContext = { organizationId };
          return next();
        }
      }

      const organizationId = await resolveOrganizationId(req);
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'organizationId or serverId is required',
        });
      }

      const result = await permissionService.checkPermission(userId, organizationId, action);
      if (!result.allowed) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
        });
      }

      req.roleOrgContext = { organizationId };
      return next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Permission check failed',
      });
    }
  };
}

module.exports = {
  requireRolePermission,
  resolveOrganizationId,
};
