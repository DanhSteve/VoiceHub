const Membership = require('../models/Membership');
const Department = require('../models/Department');
const Team = require('../models/Team');
const { resolveOrgAccess } = require('../utils/orgAccess');
const {
  isMultiPlacementReadEnabled,
  resolveEffectiveScopesFromAssignments,
} = require('./memberScopePolicy.service');

async function resolveTaskWorkspaceScope(userId, orgId) {
  const uid = String(userId || '').trim();
  const oid = String(orgId || '').trim();
  if (!uid || !oid) return null;

  const access = await resolveOrgAccess(uid, oid);
  if (!access.ok) return null;

  if (access.rolesOnly && !access.membership) {
    return {
      visibility: 'self',
      canCreateTask: false,
      canUseAiTask: false,
      assignableUserIds: [uid],
      departmentIds: [],
      teamIds: [],
      divisionIds: [],
    };
  }

  const membership = access.membership;
  if (!membership) return null;

  const membershipRole = Membership.normalizeRole(membership.role);
  const headedDepts = await Department.find({ organization: oid, head: uid })
    .select('_id name division')
    .lean();
  const ledTeams = await Team.find({ organization: oid, leader: uid, isActive: true })
    .select('_id name department division members')
    .lean();

  let visibility = 'self';
  let canCreateTask = false;

  if (membershipRole === 'owner' || membershipRole === 'admin') {
    visibility = 'org';
    canCreateTask = true;
  } else if (headedDepts.length) {
    visibility = 'department';
    canCreateTask = true;
  } else if (ledTeams.length) {
    visibility = 'team';
    canCreateTask = true;
  } else if (membershipRole === 'hr') {
    visibility = 'org';
    canCreateTask = false;
  }

  const departmentIds = headedDepts.map((d) => String(d._id));
  const ledTeamIds = ledTeams.map((t) => String(t._id));

  let scopedDivisionIds = [];
  if (isMultiPlacementReadEnabled()) {
    const effectiveScopes = await resolveEffectiveScopesFromAssignments(oid, uid);
    if (effectiveScopes.teamIds.size) {
      visibility = 'team';
      canCreateTask = true;
    } else if (effectiveScopes.departmentIds.size) {
      visibility = 'department';
      canCreateTask = true;
    } else if (effectiveScopes.divisionIds.size) {
      visibility = 'division';
      canCreateTask = true;
    }
    if (membershipRole === 'owner' || membershipRole === 'admin') {
      visibility = 'org';
      canCreateTask = true;
    } else if (membershipRole === 'hr') {
      visibility = 'org';
      canCreateTask = false;
    }
    scopedDivisionIds = [...effectiveScopes.divisionIds];
    if (visibility === 'department') {
      departmentIds.splice(0, departmentIds.length, ...effectiveScopes.departmentIds);
    }
    if (visibility === 'team') {
      ledTeamIds.splice(0, ledTeamIds.length, ...effectiveScopes.teamIds);
    }
  }

  let departmentTeamIds = [];
  if (departmentIds.length) {
    const teamsInDept = await Team.find({
      organization: oid,
      department: { $in: departmentIds },
      isActive: true,
    })
      .select('_id')
      .lean();
    departmentTeamIds = teamsInDept.map((t) => String(t._id));
  }

  const teamIds =
    visibility === 'department'
      ? [...new Set([...ledTeamIds, ...departmentTeamIds])]
      : ledTeamIds;

  const assignableUserIds = await collectAssignableUserIds(oid, visibility, {
    divisionIds: scopedDivisionIds,
    departmentIds,
    teamIds,
    ledTeams,
  });

  return {
    visibility,
    canCreateTask,
    canUseAiTask: canCreateTask,
    membershipRole,
    departmentIds,
    teamIds,
    divisionIds: scopedDivisionIds,
    divisionId: scopedDivisionIds[0] || null,
    departmentId: departmentIds[0] || null,
    teamId: teamIds[0] || null,
    assignableUserIds,
  };
}

async function collectAssignableUserIds(orgId, visibility, { divisionIds, departmentIds, teamIds, ledTeams }) {
  const ids = new Set();

  if (visibility === 'org') {
    const rows = await Membership.find({ organization: orgId, status: 'active' }).select('user').lean();
    for (const row of rows) {
      if (row?.user) ids.add(String(row.user));
    }
    return [...ids];
  }

  if (visibility === 'department' && departmentIds.length) {
    const memberships = await Membership.find({
      organization: orgId,
      status: 'active',
      $or: [
        { department: { $in: departmentIds } },
        ...(teamIds.length ? [{ team: { $in: teamIds } }] : []),
      ],
    })
      .select('user')
      .lean();
    for (const row of memberships) {
      if (row?.user) ids.add(String(row.user));
    }
    if (teamIds.length) {
      const teams = await Team.find({ _id: { $in: teamIds } }).select('members leader').lean();
      for (const team of teams) {
        if (team?.leader) ids.add(String(team.leader));
        for (const m of team.members || []) {
          if (m) ids.add(String(m));
        }
      }
    }
    return [...ids];
  }

  if (visibility === 'division') {
    const memberships = await Membership.find({
      organization: orgId,
      status: 'active',
      ...(Array.isArray(divisionIds) && divisionIds.length
        ? { division: { $in: divisionIds } }
        : {}),
    })
      .select('user division')
      .lean();
    for (const row of memberships) {
      if (row?.user) ids.add(String(row.user));
    }
    return [...ids];
  }

  if (visibility === 'team' && teamIds.length) {
    const memberships = await Membership.find({
      organization: orgId,
      status: 'active',
      team: { $in: teamIds },
    })
      .select('user')
      .lean();
    for (const row of memberships) {
      if (row?.user) ids.add(String(row.user));
    }
    for (const team of ledTeams) {
      if (team?.leader) ids.add(String(team.leader));
      for (const m of team.members || []) {
        if (m) ids.add(String(m));
      }
    }
    return [...ids];
  }

  return [];
}

module.exports = { resolveTaskWorkspaceScope };
