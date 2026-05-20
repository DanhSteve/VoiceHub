const Membership = require('../models/Membership');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Division = require('../models/Division');
const {
  fetchUserRoleNamesInOrg,
  resolveUserHierarchyScopes,
} = require('../utils/memberPlacementScope');
const { logger } = require('/shared');

function pickPrimaryPlacement(scopes, { teams = [], departments = [] } = {}) {
  if (!scopes) {
    return { branchId: null, divisionId: null, departmentId: null, teamId: null };
  }

  if (scopes.teamIds?.size) {
    const teamId = [...scopes.teamIds][0];
    const team = teams.find((t) => String(t._id) === String(teamId));
    return {
      branchId: team?.branch ? String(team.branch) : null,
      divisionId: team?.division ? String(team.division) : null,
      departmentId: team?.department ? String(team.department) : null,
      teamId: String(teamId),
    };
  }

  if (scopes.departmentIds?.size) {
    const departmentId = [...scopes.departmentIds][0];
    const dept = departments.find((d) => String(d._id) === String(departmentId));
    return {
      branchId: dept?.branch ? String(dept.branch) : null,
      divisionId: dept?.division ? String(dept.division) : null,
      departmentId: String(departmentId),
      teamId: null,
    };
  }

  if (scopes.divisionIds?.size) {
    const divisionId = [...scopes.divisionIds][0];
    return {
      branchId: null,
      divisionId: String(divisionId),
      departmentId: null,
      teamId: null,
    };
  }

  return { branchId: null, divisionId: null, departmentId: null, teamId: null };
}

async function addUserToEntityMembers(Model, entityId, userId) {
  if (!entityId || !userId) return;
  await Model.updateOne({ _id: entityId }, { $addToSet: { members: userId } });
}

async function removeUserFromOtherTeams(orgId, userId, keepTeamId) {
  await Team.updateMany(
    {
      organization: orgId,
      isActive: true,
      _id: keepTeamId ? { $ne: keepTeamId } : { $exists: true },
      members: userId,
    },
    { $pull: { members: userId } }
  );
}

async function removeUserFromOtherDepartments(orgId, userId, keepDeptId) {
  await Department.updateMany(
    {
      organization: orgId,
      _id: keepDeptId ? { $ne: keepDeptId } : { $exists: true },
      members: userId,
    },
    { $pull: { members: userId } }
  );
}

/**
 * Đồng bộ Membership + Department.members / Team.members từ các role hierarchy (div_/dep_/team_).
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
  const placement = pickPrimaryPlacement(scopes, { teams, departments });

  const prevTeamId = membership.team ? String(membership.team) : null;
  const prevDeptId = membership.department ? String(membership.department) : null;

  membership.branch = placement.branchId || null;
  membership.division = placement.divisionId || null;
  membership.department = placement.departmentId || null;
  membership.team = placement.teamId || null;
  await membership.save();

  if (placement.teamId) {
    await addUserToEntityMembers(Team, placement.teamId, uid);
    await removeUserFromOtherTeams(oid, uid, placement.teamId);
  } else {
    await removeUserFromOtherTeams(oid, uid, null);
  }

  if (placement.departmentId) {
    await addUserToEntityMembers(Department, placement.departmentId, uid);
    await removeUserFromOtherDepartments(oid, uid, placement.departmentId);
  } else if (!placement.teamId) {
    await removeUserFromOtherDepartments(oid, uid, null);
  }

  logger.info('[membershipPlacementSync] synced', {
    userId: uid,
    organizationId: oid,
    teamId: placement.teamId,
    departmentId: placement.departmentId,
    divisionId: placement.divisionId,
    prevTeamId,
    prevDeptId,
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
  pickPrimaryPlacement,
};
