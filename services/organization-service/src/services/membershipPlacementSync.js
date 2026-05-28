const Membership = require('../models/Membership');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const {
  fetchUserRoleNamesInOrg,
  resolveUserHierarchyScopes,
} = require('../utils/memberPlacementScope');
const { upsertAssignmentsFromScopes, pickPrimaryScope } = require('./memberScopePolicy.service');
const { logger } = require('/shared');

/**
 * Đồng bộ RoleScopeAssignment từ các role hierarchy (div_/dep_/team_).
 * Gọi sau khi gán/gỡ role vị trí trong role-permission-service.
 */
async function syncMembershipPlacementFromRoles(userId, organizationId) {
  const uid = String(userId || '');
  const oid = String(organizationId || '');
  if (!uid || !oid) return { ok: false, reason: 'missing_ids' };

  const membership = await Membership.findOne({
    user: uid,
    organization: oid,
    status: 'active',
  });
  if (!membership) {
    return { ok: false, reason: 'no_membership' };
  }

  const roleNames = await fetchUserRoleNamesInOrg(uid, oid);
  const [divisions, departments, teams] = await Promise.all([
    Division.find({ organization: oid }).select('_id name branch').lean(),
    Department.find({ organization: oid }).select('_id name branch division').lean(),
    Team.find({ organization: oid, isActive: true }).select('_id name branch division department').lean(),
  ]);

  const scopes = resolveUserHierarchyScopes(roleNames, {
    divisions,
    departments,
    teams,
  });

  const targetDivisionIds = [...(scopes.divisionIds || [])].map(String).filter(Boolean);
  const targetDepartmentIds = [...(scopes.departmentIds || [])].map(String).filter(Boolean);
  const targetTeamIds = [...(scopes.teamIds || [])].map(String).filter(Boolean);

  // Đồng bộ member list theo scope role hiện tại:
  // - role còn scope: giữ user trong cấp tương ứng
  // - role bị gỡ: tự động pull user ra khỏi cấp không còn thuộc scope
  await Promise.all([
    Division.updateMany(
      {
        organization: oid,
        isActive: true,
        members: uid,
        ...(targetDivisionIds.length ? { _id: { $nin: targetDivisionIds } } : {}),
      },
      { $pull: { members: uid } }
    ),
    Department.updateMany(
      {
        organization: oid,
        members: uid,
        ...(targetDepartmentIds.length ? { _id: { $nin: targetDepartmentIds } } : {}),
      },
      { $pull: { members: uid } }
    ),
    Team.updateMany(
      {
        organization: oid,
        isActive: true,
        members: uid,
        ...(targetTeamIds.length ? { _id: { $nin: targetTeamIds } } : {}),
      },
      { $pull: { members: uid } }
    ),
  ]);

  await Promise.all([
    targetDivisionIds.length
      ? Division.updateMany(
          { organization: oid, isActive: true, _id: { $in: targetDivisionIds } },
          { $addToSet: { members: uid } }
        )
      : null,
    targetDepartmentIds.length
      ? Department.updateMany(
          { organization: oid, _id: { $in: targetDepartmentIds } },
          { $addToSet: { members: uid } }
        )
      : null,
    targetTeamIds.length
      ? Team.updateMany(
          { organization: oid, isActive: true, _id: { $in: targetTeamIds } },
          { $addToSet: { members: uid } }
        )
      : null,
  ]);
  await upsertAssignmentsFromScopes({
    organizationId: oid,
    userId: uid,
    roleNames,
    scopeSets: scopes,
    source: 'role_sync',
  });
  const placement = pickPrimaryScope(scopes);

  logger.info('[membershipPlacementSync] synced', {
    userId: uid,
    organizationId: oid,
    teamId: placement.teamId,
    departmentId: placement.departmentId,
    divisionId: placement.divisionId,
    roleCount: roleNames.length,
  });

  return {
    ok: true,
    placement,
    roleNames,
  };
}

module.exports = {
  syncMembershipPlacementFromRoles,
};
