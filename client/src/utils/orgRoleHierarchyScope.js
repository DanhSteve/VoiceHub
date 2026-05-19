/** Khớp logic backend memberPlacementScope — map vai trò RBAC → khối/phòng/team. */

function foldLabel(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const shortId = (id) => String(id || '').slice(-6);

export function normalizeEntityLabel(name) {
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
  return foldLabel(label);
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

export function flattenStructureForScope(workspaceStructure) {
  const divisions = [];
  const departments = [];
  const teams = [];
  for (const branch of workspaceStructure || []) {
    for (const division of branch?.divisions || []) {
      divisions.push({ _id: division._id, name: division.name });
      for (const department of division?.departments || []) {
        departments.push({
          _id: department._id,
          name: department.name,
          division: division._id,
        });
        for (const team of department?.teams || []) {
          teams.push({
            _id: team._id,
            name: team.name,
            department: department._id,
            division: division._id,
          });
        }
      }
    }
  }
  return { divisions, departments, teams };
}

export function resolveUserHierarchyScopes(roleNames, { divisions = [], departments = [], teams = [] } = {}) {
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
    divisionIds: [...divisionIds],
    departmentIds: [...departmentIds],
    teamIds: [...teamIds],
  };
}

/** Quyền kênh theo tầng — khối không kế thừa xuống phòng/team (khớp backend). */
export function channelInHierarchyScope(channel, scopes) {
  if (!channel || !scopes) return false;
  const teamId = channel.team ? String(channel.team) : '';
  const depId = channel.department ? String(channel.department) : '';
  const divId = channel.division ? String(channel.division) : '';
  const teamSet = new Set((scopes.teamIds || []).map(String));
  const depSet = new Set((scopes.departmentIds || []).map(String));
  const divSet = new Set((scopes.divisionIds || []).map(String));
  if (teamId) return teamSet.has(teamId);
  if (depId) return depSet.has(depId);
  if (divId) return divSet.has(divId);
  return false;
}

export function mergeScopedIds(apiList, extraList) {
  return [...new Set([...(apiList || []).map(String), ...(extraList || []).map(String)])];
}
