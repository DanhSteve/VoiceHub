const RoleScopeAssignment = require('../models/RoleScopeAssignment');
const Department = require('../models/Department');
const Team = require('../models/Team');

const READ_FLAG =
  String(process.env.RBAC_ASSIGNMENT_ONLY || process.env.RBAC_MULTI_PLACEMENT_READ || 'false').toLowerCase() ===
  'true';
const WRITE_FLAG =
  String(process.env.RBAC_ASSIGNMENT_ONLY || process.env.RBAC_MULTI_PLACEMENT_WRITE || 'false').toLowerCase() ===
  'true';

function isMultiPlacementReadEnabled() {
  return READ_FLAG;
}

function isMultiPlacementWriteEnabled() {
  return WRITE_FLAG;
}

async function listActiveAssignments(organizationId, userId) {
  if (!organizationId || !userId) return [];
  return RoleScopeAssignment.find({
    organization: organizationId,
    user: userId,
    active: true,
  })
    .select('roleId scopeType scopeId')
    .lean();
}

async function upsertAssignmentsFromScopes({
  organizationId,
  userId,
  roleNames = [],
  scopeSets,
  source = 'role_sync',
}) {
  if (!isMultiPlacementWriteEnabled()) return { ok: true, skipped: 'write_flag_off' };
  if (!organizationId || !userId || !scopeSets) return { ok: false, reason: 'missing_args' };

  const docs = [];
  const roleHint = Array.isArray(roleNames) && roleNames.length ? roleNames[0] : 'hierarchy-role';
  for (const divisionId of scopeSets.divisionIds || []) {
    docs.push({
      organization: organizationId,
      user: userId,
      roleId: roleHint,
      scopeType: 'division',
      scopeId: divisionId,
      active: true,
      source,
    });
  }
  for (const departmentId of scopeSets.departmentIds || []) {
    docs.push({
      organization: organizationId,
      user: userId,
      roleId: roleHint,
      scopeType: 'department',
      scopeId: departmentId,
      active: true,
      source,
    });
  }
  for (const teamId of scopeSets.teamIds || []) {
    docs.push({
      organization: organizationId,
      user: userId,
      roleId: roleHint,
      scopeType: 'team',
      scopeId: teamId,
      active: true,
      source,
    });
  }

  await RoleScopeAssignment.deleteMany({ organization: organizationId, user: userId });
  if (docs.length) {
    await RoleScopeAssignment.insertMany(docs, { ordered: false });
  }
  return { ok: true, count: docs.length };
}

function mergeAssignmentsIntoScopes(scopes, assignments = []) {
  const next = {
    divisionIds: new Set(scopes?.divisionIds || []),
    departmentIds: new Set(scopes?.departmentIds || []),
    teamIds: new Set(scopes?.teamIds || []),
  };
  for (const row of assignments) {
    const id = row?.scopeId ? String(row.scopeId) : '';
    if (!id) continue;
    if (row.scopeType === 'division') next.divisionIds.add(id);
    if (row.scopeType === 'department') next.departmentIds.add(id);
    if (row.scopeType === 'team') next.teamIds.add(id);
  }
  return next;
}

async function resolveEffectiveScopesFromAssignments(organizationId, userId) {
  const assignments = await listActiveAssignments(organizationId, userId);
  const teamIds = [];
  const departmentIds = [];
  const divisionIds = [];
  for (const row of assignments) {
    const id = row?.scopeId ? String(row.scopeId) : '';
    if (!id) continue;
    if (row.scopeType === 'team') teamIds.push(id);
    if (row.scopeType === 'department') departmentIds.push(id);
    if (row.scopeType === 'division') divisionIds.push(id);
  }

  const [teams, departments] = await Promise.all([
    teamIds.length
      ? Team.find({
          organization: organizationId,
          _id: { $in: teamIds },
          isActive: true,
        })
          .select('_id department division')
          .lean()
      : [],
    departmentIds.length
      ? Department.find({
          organization: organizationId,
          _id: { $in: departmentIds },
        })
          .select('_id division')
          .lean()
      : [],
  ]);
  const deptById = new Map(departments.map((d) => [String(d._id), d]));

  const scope = {
    divisionIds: new Set(divisionIds),
    departmentIds: new Set(departmentIds),
    teamIds: new Set(teamIds),
  };
  for (const team of teams) {
    if (team?.department) scope.departmentIds.add(String(team.department));
    if (team?.division) scope.divisionIds.add(String(team.division));
  }
  for (const deptId of scope.departmentIds) {
    const dept = deptById.get(String(deptId));
    if (dept?.division) scope.divisionIds.add(String(dept.division));
  }
  return scope;
}

function pickPrimaryScope(scope) {
  const teamId = scope?.teamIds?.values?.().next?.().value || null;
  const departmentId = scope?.departmentIds?.values?.().next?.().value || null;
  const divisionId = scope?.divisionIds?.values?.().next?.().value || null;
  return {
    branchId: null,
    divisionId: divisionId ? String(divisionId) : null,
    departmentId: departmentId ? String(departmentId) : null,
    teamId: teamId ? String(teamId) : null,
  };
}

module.exports = {
  isMultiPlacementReadEnabled,
  isMultiPlacementWriteEnabled,
  listActiveAssignments,
  upsertAssignmentsFromScopes,
  mergeAssignmentsIntoScopes,
  resolveEffectiveScopesFromAssignments,
  pickPrimaryScope,
};
