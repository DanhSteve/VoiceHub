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
  if (!userId || !orgId || !GATEWAY_INTERNAL_TOKEN) return [];
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
  for (const name of roleNames || []) {
    const lower = String(name || '').toLowerCase();
    const divMatch = lower.match(/div_([a-f0-9]{6})/);
    const depMatch = lower.match(/dep_([a-f0-9]{6})/);
    if (divMatch) divSuffixes.add(divMatch[1]);
    if (depMatch) depSuffixes.add(depMatch[1]);
  }
  return { divSuffixes, depSuffixes };
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
  return label.trim().toLowerCase();
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
  if (!a?.divisionId || !a?.departmentId || !b?.divisionId || !b?.departmentId) return false;
  return a.divisionId === b.divisionId && a.departmentId === b.departmentId;
}

module.exports = {
  fetchUserRoleNamesInOrg,
  resolveMembershipPlacement,
  resolveMemberPlacementScope,
  placementsMatch,
  buildSuffixToIdMap,
  normalizeEntityLabel,
};
