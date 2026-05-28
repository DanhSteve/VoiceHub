const { mongoose } = require('/shared/config/mongo');
const Membership = require('../models/Membership');
const { fetchUserRolesInOrg } = require('./orgRoles');

function toObjectId(id) {
  const s = String(id || '').trim();
  if (!s) return null;
  if (mongoose.Types.ObjectId.isValid(s)) {
    return new mongoose.Types.ObjectId(s);
  }
  return s;
}

async function findActiveMembership(userId, orgId) {
  const user = toObjectId(userId);
  const organization = toObjectId(orgId);
  if (!user || !organization) return null;
  return Membership.findOne({ user, organization, status: 'active' }).lean();
}

/**
 * Quyền vào dữ liệu org: membership active HOẶC đã được gán RBAC role trong org.
 * Tránh 403 khi admin chỉ gán role mà membership/query lệch ObjectId.
 */
async function resolveOrgAccess(userId, orgId) {
  const membership = await findActiveMembership(userId, orgId);
  if (membership) {
    return { ok: true, membership, rolesOnly: false, roles: [] };
  }
  const roles = await fetchUserRolesInOrg(userId, orgId);
  if (roles.length > 0) {
    return { ok: true, membership: null, rolesOnly: true, roles };
  }
  return { ok: false, membership: null, rolesOnly: false, roles: [] };
}

module.exports = {
  toObjectId,
  findActiveMembership,
  resolveOrgAccess,
};
