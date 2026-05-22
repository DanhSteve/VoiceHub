const axios = require('axios');

const ROLE_PERMISSION_BASE = String(
  process.env.ROLE_PERMISSION_SERVICE_URL || 'http://role-permission-service:3015'
).replace(/\/$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

const shortId = (id) => String(id || '').slice(-6);

function roleInternalHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (GATEWAY_INTERNAL_TOKEN) h['x-gateway-internal-token'] = GATEWAY_INTERNAL_TOKEN;
  return h;
}

async function fetchUserRoleNamesInOrg(userId, orgId) {
  if (!userId || !orgId) return [];
  try {
    const res = await axios.get(
      `${ROLE_PERMISSION_BASE}/api/roles/user/${encodeURIComponent(String(userId))}/server/${encodeURIComponent(
        String(orgId)
      )}`,
      {
        headers: roleInternalHeaders(),
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200 || !Array.isArray(res.data?.data)) return [];
    return res.data.data.map((r) => String(r?.name || '')).filter(Boolean);
  } catch {
    return [];
  }
}

function buildSuffixToIdMap(entities) {
  const map = new Map();
  for (const entity of entities || []) {
    const id = String(entity._id);
    map.set(shortId(id).toLowerCase(), id);
  }
  return map;
}

function extractScopedSuffixes(roleNames) {
  const divSuffixes = new Set();
  const depSuffixes = new Set();
  const teamSuffixes = new Set();
  for (const name of roleNames || []) {
    const lower = String(name || '').toLowerCase();
    const divMatch = lower.match(/div_([a-f0-9]{6})/);
    const depMatch = lower.match(/dep_([a-f0-9]{6})/);
    const teamMatch = lower.match(/team_([a-f0-9]{6})/);
    if (divMatch) divSuffixes.add(divMatch[1]);
    if (depMatch) depSuffixes.add(depMatch[1]);
    if (teamMatch) teamSuffixes.add(teamMatch[1]);
  }
  return { divSuffixes, depSuffixes, teamSuffixes };
}

/** Chuẩn hóa nhãn khối/phòng từ tên role (Khối: X, Phòng ban: Y, Khối X, …). */
function normalizeEntityLabel(name) {
  let label = String(name || '').trim();
  label = label.replace(/\s*[•·]\s*(div|dep|team|branch)_[a-z0-9_-]+$/i, '');
  label = label.replace(
    /^\s*(khối|khoi|phòng ban|phong ban|team|chi nhánh|chi nhanh|division|department|branch)\s*:\s*/i,
    ''
  );
  label = label.replace(/^\s*(khối|khoi)\s+/i, '');
  label = label.replace(/^\s*(phòng ban|phong ban)\s+/i, '');
  label = label.replace(/^\s*(phòng|phong)\s+/i, '');
  label = label.replace(/^\s*team\s+/i, '');
  return String(label || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function resolvePlacementFromRoleLabels(roleNames, divisions, departments) {
  const divisionNormToId = new Map();
  for (const division of divisions || []) {
    const key = normalizeEntityLabel(division.name);
    if (key) divisionNormToId.set(key, String(division._id));
  }

  let divisionId = null;
  for (const roleName of roleNames || []) {
    const key = normalizeEntityLabel(roleName);
    if (key && divisionNormToId.has(key)) {
      divisionId = divisionNormToId.get(key);
      break;
    }
  }

  let departmentId = null;
  for (const roleName of roleNames || []) {
    const key = normalizeEntityLabel(roleName);
    if (!key) continue;
    for (const dept of departments || []) {
      if (normalizeEntityLabel(dept.name) !== key) continue;
      const deptDivisionId = dept.division ? String(dept.division) : null;
      if (divisionId && deptDivisionId && deptDivisionId !== divisionId) continue;
      departmentId = String(dept._id);
      if (!divisionId && deptDivisionId) divisionId = deptDivisionId;
      break;
    }
    if (departmentId) break;
  }

  if (departmentId && !divisionId) {
    const dept = (departments || []).find((d) => String(d._id) === departmentId);
    if (dept?.division) divisionId = String(dept.division);
  }

  return { divisionId, departmentId };
}

function resolvePlacementFromRoleTags(roleNames, divisionBySuffix, departmentBySuffix, departments) {
  const { divSuffixes, depSuffixes } = extractScopedSuffixes(roleNames);
  if (!divSuffixes.size && !depSuffixes.size) {
    return { divisionId: null, departmentId: null };
  }

  const deptById = new Map((departments || []).map((d) => [String(d._id), d]));

  for (const depSuffix of depSuffixes) {
    const departmentId = departmentBySuffix.get(depSuffix);
    if (!departmentId) continue;
    const dept = deptById.get(departmentId);
    const divisionFromDept = dept?.division ? String(dept.division) : null;

    if (divSuffixes.size) {
      for (const divSuffix of divSuffixes) {
        const divisionId = divisionBySuffix.get(divSuffix);
        if (divisionId && divisionFromDept && divisionId === divisionFromDept) {
          return { divisionId, departmentId };
        }
      }
    }

    if (divisionFromDept) {
      return { divisionId: divisionFromDept, departmentId };
    }
  }

  if (divSuffixes.size === 1 && !depSuffixes.size) {
    const divisionId = divisionBySuffix.get([...divSuffixes][0]);
    if (divisionId) return { divisionId, departmentId: null };
  }

  return { divisionId: null, departmentId: null };
}

function resolveMembershipPlacement(membership, teamById) {
  if (!membership) return { divisionId: null, departmentId: null };
  const divisionId = membership.division ? String(membership.division) : null;
  const departmentId = membership.department ? String(membership.department) : null;
  if (divisionId && departmentId) {
    return { divisionId, departmentId };
  }
  const teamId = membership.team ? String(membership.team) : null;
  if (teamId && teamById?.has(teamId)) {
    const team = teamById.get(teamId);
    return {
      divisionId: team?.division ? String(team.division) : divisionId,
      departmentId: team?.department ? String(team.department) : departmentId,
    };
  }
  return { divisionId, departmentId };
}

/**
 * Suy khối + phòng ban: ưu tiên tag div_/dep_ trên role, rồi nhãn role, cuối cùng membership/team.
 * Không trộn nguồn — tránh gán nhầm phòng ban trùng tên khác khối.
 */
function resolveMemberPlacementScope(
  membership,
  teamById,
  roleNames,
  { divisionBySuffix, departmentBySuffix, divisions, departments }
) {
  const fromTags = resolvePlacementFromRoleTags(
    roleNames,
    divisionBySuffix,
    departmentBySuffix,
    departments
  );
  if (fromTags.divisionId && fromTags.departmentId) return fromTags;

  const fromLabels = resolvePlacementFromRoleLabels(roleNames, divisions, departments);
  if (fromLabels.divisionId && fromLabels.departmentId) return fromLabels;

  return resolveMembershipPlacement(membership, teamById);
}

function placementsMatch(a, b) {
  if (!a?.divisionId || !a?.departmentId || !b?.departmentId || !b?.departmentId) return false;
  return a.divisionId === b.divisionId && a.departmentId === b.departmentId;
}

/**
 * Gom phạm vi khối / phòng / team từ mọi vai trò RBAC của user (tag div_/dep_/team_ + nhãn hiển thị).
 */
function resolveUserHierarchyScopes(roleNames, { divisions = [], departments = [], teams = [] } = {}) {
  const divisionIds = new Set();
  const departmentIds = new Set();
  const teamIds = new Set();

  const divisionBySuffix = buildSuffixToIdMap(divisions);
  const departmentBySuffix = buildSuffixToIdMap(departments);
  const teamBySuffix = buildSuffixToIdMap(teams);

  const { divSuffixes, depSuffixes, teamSuffixes } = extractScopedSuffixes(roleNames);
  for (const suffix of divSuffixes) {
    const id = divisionBySuffix.get(suffix);
    if (id) divisionIds.add(id);
  }
  for (const suffix of depSuffixes) {
    const id = departmentBySuffix.get(suffix);
    if (id) departmentIds.add(id);
  }
  for (const suffix of teamSuffixes) {
    const id = teamBySuffix.get(suffix);
    if (id) teamIds.add(id);
  }

  const divisionNormToId = new Map();
  for (const division of divisions) {
    const key = normalizeEntityLabel(division.name);
    if (key) divisionNormToId.set(key, String(division._id));
  }

  for (const roleName of roleNames || []) {
    const key = normalizeEntityLabel(roleName);
    if (!key) continue;
    if (divisionNormToId.has(key)) divisionIds.add(divisionNormToId.get(key));
    for (const dept of departments) {
      if (normalizeEntityLabel(dept.name) !== key) continue;
      departmentIds.add(String(dept._id));
      if (dept.division) divisionIds.add(String(dept.division));
    }
    for (const team of teams) {
      if (normalizeEntityLabel(team.name) !== key) continue;
      teamIds.add(String(team._id));
      if (team.department) departmentIds.add(String(team.department));
      if (team.division) divisionIds.add(String(team.division));
    }
  }

  for (const deptId of departmentIds) {
    const dept = departments.find((d) => String(d._id) === String(deptId));
    if (dept?.division) divisionIds.add(String(dept.division));
  }
  for (const teamId of teamIds) {
    const team = teams.find((t) => String(t._id) === String(teamId));
    if (team?.department) departmentIds.add(String(team.department));
    if (team?.division) divisionIds.add(String(team.division));
  }

  return {
    divisionIds,
    departmentIds,
    teamIds,
  };
}

/** Cấp gắn trên tên role (Khối / Phòng / Team / tag div_|dep_|team_). */
function getRoleHierarchyLevel(roleName) {
  const raw = String(roleName || '').trim();
  const lower = raw.toLowerCase();
  if (/(?:^|\s)team_[a-f0-9]{6}\b/.test(lower)) return 'team';
  if (/(?:^|\s)dep_[a-f0-9]{6}\b/.test(lower)) return 'department';
  if (/(?:^|\s)div_[a-f0-9]{6}\b/.test(lower)) return 'division';
  if (/^\s*team\s+/i.test(raw)) return 'team';
  if (/^\s*(phòng ban|phong ban|phòng|phong)\s+/i.test(raw)) return 'department';
  if (/^\s*(phòng ban|phong ban|phòng|phong)\s*:/i.test(raw)) return 'department';
  if (/^\s*(khối|khoi)\s+/i.test(raw)) return 'division';
  if (/^\s*(khối|khoi)\s*:/i.test(raw)) return 'division';
  return null;
}

function resolveEntityIdForRoleLevel(roleName, level, divisions, departments, teams) {
  const key = normalizeEntityLabel(roleName);
  if (!key) return null;

  const divisionBySuffix = buildSuffixToIdMap(divisions);
  const departmentBySuffix = buildSuffixToIdMap(departments);
  const teamBySuffix = buildSuffixToIdMap(teams);
  const lower = String(roleName || '').toLowerCase();
  const divTag = lower.match(/(?:^|\s)div_([a-f0-9]{6})\b/);
  const depTag = lower.match(/(?:^|\s)dep_([a-f0-9]{6})\b/);
  const teamTag = lower.match(/(?:^|\s)team_([a-f0-9]{6})\b/);

  if (level === 'division') {
    if (divTag) {
      const id = divisionBySuffix.get(divTag[1]);
      return id ? { divisionId: id } : null;
    }
    for (const division of divisions || []) {
      if (normalizeEntityLabel(division.name) === key) {
        return { divisionId: String(division._id) };
      }
    }
    return null;
  }

  if (level === 'department') {
    if (depTag) {
      const departmentId = departmentBySuffix.get(depTag[1]);
      if (!departmentId) return null;
      const dept = (departments || []).find((d) => String(d._id) === departmentId);
      return {
        departmentId,
        divisionId: dept?.division ? String(dept.division) : null,
      };
    }
    for (const dept of departments || []) {
      if (normalizeEntityLabel(dept.name) === key) {
        return {
          departmentId: String(dept._id),
          divisionId: dept.division ? String(dept.division) : null,
        };
      }
    }
    return null;
  }

  if (level === 'team') {
    if (teamTag) {
      const teamId = teamBySuffix.get(teamTag[1]);
      if (!teamId) return null;
      const team = (teams || []).find((t) => String(t._id) === teamId);
      return {
        teamId,
        departmentId: team?.department ? String(team.department) : null,
        divisionId: team?.division ? String(team.division) : null,
      };
    }
    for (const team of teams || []) {
      if (normalizeEntityLabel(team.name) === key) {
        return {
          teamId: String(team._id),
          departmentId: team.department ? String(team.department) : null,
          divisionId: team.division ? String(team.division) : null,
        };
      }
    }
    return null;
  }

  return null;
}

/**
 * Phạm vi HIỂN THỊ cây tổ chức — thu hẹp dần: team > phòng > khối.
 * Kênh vẫn khóa nếu không có quyền đọc trên kênh/scope role (xử lý ở controller).
 */
function resolveStructureVisibilityFromRoles(roleNames, { divisions = [], departments = [], teams = [] } = {}) {
  const divisionIds = new Set();
  const departmentIds = new Set();
  const teamIds = new Set();
  const levels = new Set();

  for (const roleName of roleNames || []) {
    const level = getRoleHierarchyLevel(roleName);
    if (!level) continue;
    levels.add(level);
    const hit = resolveEntityIdForRoleLevel(roleName, level, divisions, departments, teams);
    if (!hit) continue;
    if (hit.divisionId) divisionIds.add(String(hit.divisionId));
    if (hit.departmentId) departmentIds.add(String(hit.departmentId));
    if (hit.teamId) teamIds.add(String(hit.teamId));
  }

  let mode = 'none';
  if (levels.has('team')) mode = 'team';
  else if (levels.has('department')) mode = 'department';
  else if (levels.has('division')) mode = 'division';

  const outDivisions = new Set();
  const outDepartments = new Set();
  const outTeams = new Set();

  if (mode === 'team') {
    for (const teamId of teamIds) {
      outTeams.add(teamId);
      const team = teams.find((t) => String(t._id) === String(teamId));
      if (team?.department) outDepartments.add(String(team.department));
      if (team?.division) outDivisions.add(String(team.division));
    }
  } else if (mode === 'department') {
    for (const deptId of departmentIds) {
      outDepartments.add(deptId);
      const dept = departments.find((d) => String(d._id) === String(deptId));
      if (dept?.division) outDivisions.add(String(dept.division));
      for (const team of teams) {
        if (String(team.department || '') === String(deptId)) outTeams.add(String(team._id));
      }
    }
  } else if (mode === 'division') {
    for (const divId of divisionIds) {
      outDivisions.add(divId);
      for (const dept of departments) {
        if (String(dept.division || '') !== String(divId)) continue;
        outDepartments.add(String(dept._id));
        for (const team of teams) {
          if (String(team.department || '') === String(dept._id)) {
            outTeams.add(String(team._id));
          }
        }
      }
    }
  }

  return {
    mode,
    divisionIds: outDivisions,
    departmentIds: outDepartments,
    teamIds: outTeams,
  };
}

function channelInStructureVisibility(channel, structureVisibility) {
  if (!channel || !structureVisibility || structureVisibility.mode === 'none') {
    return false;
  }
  const teamId = channel.team ? String(channel.team) : '';
  const depId = channel.department ? String(channel.department) : '';
  const divId = channel.division ? String(channel.division) : '';
  const { divisionIds, departmentIds, teamIds } = structureVisibility;

  if (teamId) return teamIds.has(teamId);
  if (depId) return departmentIds.has(depId);
  if (divId) return divisionIds.has(divId);
  return false;
}

function channelInHierarchyScope(channel, scopes) {
  if (!channel || !scopes) return false;
  const teamSet =
    scopes.teamIds instanceof Set ? scopes.teamIds : new Set(scopes.teamIds || []);
  const depSet =
    scopes.departmentIds instanceof Set ? scopes.departmentIds : new Set(scopes.departmentIds || []);
  const divSet =
    scopes.divisionIds instanceof Set ? scopes.divisionIds : new Set(scopes.divisionIds || []);

  const teamId = channel.team ? String(channel.team) : '';
  const depId = channel.department ? String(channel.department) : '';
  const divId = channel.division ? String(channel.division) : '';

  if (teamId) return teamSet.has(teamId);
  if (depId) return depSet.has(depId);
  if (divId) return divSet.has(divId);
  return false;
}

/**
 * Vị trí chính để mở sidebar — ưu tiên team/phòng khớp nhãn role (Team BA, Phòng BA), không lấy Set[0] ngẫu nhiên.
 */
function pickPrimaryPlacement(scopes, { teams = [], departments = [], roleNames = [] } = {}) {
  if (!scopes) {
    return { branchId: null, divisionId: null, departmentId: null, teamId: null };
  }

  const teamSet =
    scopes.teamIds instanceof Set ? scopes.teamIds : new Set(scopes.teamIds || []);
  const depSet =
    scopes.departmentIds instanceof Set ? scopes.departmentIds : new Set(scopes.departmentIds || []);
  const divSet =
    scopes.divisionIds instanceof Set ? scopes.divisionIds : new Set(scopes.divisionIds || []);

  for (const roleName of roleNames || []) {
    const key = normalizeEntityLabel(roleName);
    if (!key) continue;
    for (const teamId of teamSet) {
      const team = teams.find((t) => String(t._id) === String(teamId));
      const teamNorm = normalizeEntityLabel(team?.name);
      if (!teamNorm) continue;
      if (key === teamNorm || key.includes(teamNorm) || teamNorm.includes(key)) {
        return {
          branchId: team?.branch ? String(team.branch) : null,
          divisionId: team?.division ? String(team.division) : null,
          departmentId: team?.department ? String(team.department) : null,
          teamId: String(teamId),
        };
      }
    }
  }

  for (const roleName of roleNames || []) {
    const key = normalizeEntityLabel(roleName);
    if (!key) continue;
    for (const departmentId of depSet) {
      const dept = departments.find((d) => String(d._id) === String(departmentId));
      const deptNorm = normalizeEntityLabel(dept?.name);
      if (!deptNorm) continue;
      if (key === deptNorm || key.includes(deptNorm) || deptNorm.includes(key)) {
        return {
          branchId: dept?.branch ? String(dept.branch) : null,
          divisionId: dept?.division ? String(dept.division) : null,
          departmentId: String(departmentId),
          teamId: null,
        };
      }
    }
  }

  if (teamSet.size) {
    const teamId = [...teamSet][0];
    const team = teams.find((t) => String(t._id) === String(teamId));
    return {
      branchId: team?.branch ? String(team.branch) : null,
      divisionId: team?.division ? String(team.division) : null,
      departmentId: team?.department ? String(team.department) : null,
      teamId: String(teamId),
    };
  }

  if (depSet.size) {
    const departmentId = [...depSet][0];
    const dept = departments.find((d) => String(d._id) === String(departmentId));
    return {
      branchId: dept?.branch ? String(dept.branch) : null,
      divisionId: dept?.division ? String(dept.division) : null,
      departmentId: String(departmentId),
      teamId: null,
    };
  }

  if (divSet.size) {
    const divisionId = [...divSet][0];
    return {
      branchId: null,
      divisionId: String(divisionId),
      departmentId: null,
      teamId: null,
    };
  }

  return { branchId: null, divisionId: null, departmentId: null, teamId: null };
}

module.exports = {
  fetchUserRoleNamesInOrg,
  resolveMembershipPlacement,
  resolveMemberPlacementScope,
  placementsMatch,
  buildSuffixToIdMap,
  normalizeEntityLabel,
  getRoleHierarchyLevel,
  resolveUserHierarchyScopes,
  resolveStructureVisibilityFromRoles,
  channelInStructureVisibility,
  channelInHierarchyScope,
  pickPrimaryPlacement,
};
