const axios = require('axios');
const Role = require('../models/Role');
const { logger } = require('/shared');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ORGANIZATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ORGANIZATION_SERVICE_URL');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

function internalOrgHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(GATEWAY_INTERNAL_TOKEN ? { 'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN } : {}),
  };
}

async function fetchMembershipRole(userId, organizationId) {
  if (!GATEWAY_INTERNAL_TOKEN || !userId || !organizationId) return null;
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/membership/${encodeURIComponent(organizationId)}/${encodeURIComponent(userId)}`,
      { headers: internalOrgHeaders(), timeout: 8000, validateStatus: () => true }
    );
    if (res.status !== 200) return null;
    return String(res.data?.data?.role || '').toLowerCase();
  } catch (e) {
    logger.warn('[requireOrgRoleManager] membership lookup failed', e.message);
    return null;
  }
}

function resolveOrganizationId(req) {
  return (
    req.body?.organizationId ||
    req.body?.serverId ||
    req.query?.organizationId ||
    req.query?.serverId ||
    req.params?.serverId ||
    req.resolvedOrganizationId ||
    null
  );
}

/** Chỉ owner/admin của tổ chức mới được CRUD role / gán role. */
async function requireOrgRoleManager(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    let organizationId = resolveOrganizationId(req);
    if (!organizationId && req.params?.roleId) {
      const role = await Role.findById(req.params.roleId).select('organizationId serverId').lean();
      organizationId = role?.organizationId || role?.serverId;
    }

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: 'organizationId or serverId is required',
      });
    }

    const membershipRole = await fetchMembershipRole(String(userId), String(organizationId));
    if (!membershipRole || !['owner', 'admin'].includes(membershipRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: organization admin required',
        errorCode: 'ROLE_FORBIDDEN',
      });
    }

    req.resolvedOrganizationId = String(organizationId);
    return next();
  } catch (err) {
    logger.error('[requireOrgRoleManager]', err);
    return res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
}

/** GET role: phải là thành viên active của org (serverId = organizationId). */
async function requireOrgMember(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const organizationId = req.params?.serverId || req.params?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, message: 'serverId is required' });
    }

    const membershipRole = await fetchMembershipRole(String(userId), String(organizationId));
    if (!membershipRole) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: not a member of this organization',
        errorCode: 'ROLE_FORBIDDEN',
      });
    }

    return next();
  } catch (err) {
    logger.error('[requireOrgMember]', err);
    return res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
}

/** Chỉ xem role của chính mình hoặc org admin. */
async function requireSelfOrOrgManager(req, res, next) {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const targetUserId = req.params?.userId;
    const serverId = req.params?.serverId;
    if (String(targetUserId) === String(userId)) {
      return next();
    }

    const membershipRole = await fetchMembershipRole(String(userId), String(serverId));
    if (membershipRole && ['owner', 'admin'].includes(membershipRole)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Access denied',
      errorCode: 'ROLE_FORBIDDEN',
    });
  } catch (err) {
    logger.error('[requireSelfOrOrgManager]', err);
    return res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
}

module.exports = {
  requireOrgRoleManager,
  requireOrgMember,
  requireSelfOrOrgManager,
};
