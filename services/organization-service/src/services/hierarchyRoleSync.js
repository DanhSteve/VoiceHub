const axios = require('axios');
const { logger } = require('/shared');

const ROLE_PERMISSION_BASE = String(
  process.env.ROLE_PERMISSION_SERVICE_URL || 'http://role-permission-service:3015'
).replace(/\/$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
const RETRYABLE_STATUS = new Set([500, 502, 503, 504, 429]);

/** Quyền kênh chỉ cấu hình qua ChannelRoleAccess — vai trò sync không gán permissions global. */
const PERMS_NONE = [];

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (GATEWAY_INTERNAL_TOKEN) h['x-gateway-internal-token'] = GATEWAY_INTERNAL_TOKEN;
  return h;
}

function shortId(id) {
  return String(id || '').slice(-6);
}

function divisionRoleName(name, divisionId) {
  return `Khối: ${String(name || '').trim() || 'Khối'} · div_${shortId(divisionId)}`;
}

function departmentRoleName(name, departmentId) {
  return `Phòng ban: ${String(name || '').trim() || 'Phòng ban'} · dep_${shortId(departmentId)}`;
}

function teamRoleName(name, teamId) {
  return `Team: ${String(name || '').trim() || 'Team'} · team_${shortId(teamId)}`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isRetryableNetworkError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  return ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND'].includes(code);
};

async function callRolePermissionApi(requestFn, actionLabel, maxRetries = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await requestFn();
      const status = Number(res?.status || 0);
      if (status >= 200 && status < 300) return res;
      if (!RETRYABLE_STATUS.has(status) || attempt === maxRetries) return res;
      await sleep(250 * attempt);
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt === maxRetries) throw error;
      logger.warn(`[hierarchyRoleSync] ${actionLabel} transient network error, retry=${attempt}`, error.message);
      await sleep(250 * attempt);
    }
  }
  if (lastError) throw lastError;
  return null;
}

async function listRoles(serverId) {
  const res = await callRolePermissionApi(
    () =>
      axios.get(`${ROLE_PERMISSION_BASE}/api/roles/server/${encodeURIComponent(String(serverId))}`, {
        headers: headers(),
        timeout: 8000,
        validateStatus: () => true,
      }),
    'listRoles'
  );
  if (res.status !== 200 || !Array.isArray(res.data?.data)) return [];
  return res.data.data;
}

const PRIORITY_DIVISION = 140;
const PRIORITY_DEPARTMENT = 80;
const PRIORITY_TEAM = 20;

async function createRole({ organizationId, name, permissions, priority = PRIORITY_TEAM }) {
  const res = await callRolePermissionApi(
    () =>
      axios.post(
        `${ROLE_PERMISSION_BASE}/api/roles`,
        {
          name,
          serverId: String(organizationId),
          organizationId: String(organizationId),
          permissions: Array.isArray(permissions) ? permissions : [],
          isDefault: false,
          priority,
        },
        { headers: headers(), timeout: 8000, validateStatus: () => true }
      ),
    'createRole'
  );
  if (res.status === 201) return res.data?.data || null;
  logger.warn('[hierarchyRoleSync] createRole non-201', {
    status: res.status,
    message: res.data?.message,
    name,
  });
  return null;
}

async function updateRole(roleId, { name, permissions, priority }) {
  const payload = {};
  if (name != null) payload.name = name;
  if (Array.isArray(permissions)) payload.permissions = permissions;
  if (priority != null) payload.priority = priority;
  const res = await callRolePermissionApi(
    () =>
      axios.put(
        `${ROLE_PERMISSION_BASE}/api/roles/${encodeURIComponent(String(roleId))}`,
        payload,
        { headers: headers(), timeout: 8000, validateStatus: () => true }
      ),
    'updateRole'
  );
  if (res.status < 200 || res.status >= 300) {
    logger.warn('[hierarchyRoleSync] updateRole non-2xx', {
      status: res.status,
      message: res.data?.message,
      roleId: String(roleId),
      name,
    });
  }
}

function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) return [];
  return permissions
    .map((p) => ({
      resource: String(p?.resource || '').trim(),
      actions: Array.isArray(p?.actions)
        ? [...new Set(p.actions.map((a) => String(a || '').trim()).filter(Boolean))].sort()
        : [],
    }))
    .filter((p) => p.resource && p.actions.length > 0)
    .sort((a, b) => a.resource.localeCompare(b.resource));
}

function samePermissions(a, b) {
  return JSON.stringify(normalizePermissions(a)) === JSON.stringify(normalizePermissions(b));
}

async function ensureRoleByTag(
  organizationId,
  roles,
  { tag, expectedName, expectedPermissions, expectedPriority }
) {
  if (!Array.isArray(roles)) return;
  const existing = roles.find((r) => String(r?.name || '').includes(tag));
  if (!existing) {
    const created = await createRole({
      organizationId,
      name: expectedName,
      permissions: expectedPermissions,
      priority: expectedPriority,
    });
    if (created?._id) roles.push(created);
    return;
  }
  const shouldUpdateName = String(existing.name) !== expectedName;
  const shouldUpdatePermissions = !samePermissions(existing.permissions, expectedPermissions);
  const shouldUpdatePriority =
    expectedPriority != null && Number(existing.priority) !== Number(expectedPriority);
  if (shouldUpdateName || shouldUpdatePermissions || shouldUpdatePriority) {
    await updateRole(existing._id, {
      ...(shouldUpdateName ? { name: expectedName } : {}),
      ...(shouldUpdatePermissions ? { permissions: expectedPermissions } : {}),
      ...(shouldUpdatePriority ? { priority: expectedPriority } : {}),
    });
  }
}

async function ensureDivisionRole(organizationId, divisionId, divisionName) {
  if (!GATEWAY_INTERNAL_TOKEN || !divisionId) return;
  try {
    const roles = await listRoles(organizationId);
    await ensureRoleByTag(organizationId, roles, {
      tag: `div_${shortId(divisionId)}`,
      expectedName: divisionRoleName(divisionName, divisionId),
      expectedPermissions: PERMS_NONE,
      expectedPriority: PRIORITY_DIVISION,
    });
  } catch (error) {
    logger.warn('[hierarchyRoleSync] ensureDivisionRole failed', error.message);
  }
}

async function ensureDepartmentRole(organizationId, departmentId, departmentName) {
  if (!GATEWAY_INTERNAL_TOKEN || !departmentId) return;
  try {
    const roles = await listRoles(organizationId);
    await ensureRoleByTag(organizationId, roles, {
      tag: `dep_${shortId(departmentId)}`,
      expectedName: departmentRoleName(departmentName, departmentId),
      expectedPermissions: PERMS_NONE,
      expectedPriority: PRIORITY_DEPARTMENT,
    });
  } catch (error) {
    logger.warn('[hierarchyRoleSync] ensureDepartmentRole failed', error.message);
  }
}

async function ensureTeamRole(organizationId, teamId, teamName) {
  if (!GATEWAY_INTERNAL_TOKEN || !teamId) return;
  try {
    const roles = await listRoles(organizationId);
    await ensureRoleByTag(organizationId, roles, {
      tag: `team_${shortId(teamId)}`,
      expectedName: teamRoleName(teamName, teamId),
      expectedPermissions: PERMS_NONE,
      expectedPriority: PRIORITY_TEAM,
    });
  } catch (error) {
    logger.warn('[hierarchyRoleSync] ensureTeamRole failed', error.message);
  }
}

async function syncHierarchyRoles(organizationId, { divisions = [], departments = [], teams = [] } = {}) {
  if (!GATEWAY_INTERNAL_TOKEN) return;
  try {
    const roles = await listRoles(organizationId);
    for (const division of divisions) {
      const divisionId = division?._id || division?.id;
      if (!divisionId) continue;
      await ensureRoleByTag(organizationId, roles, {
        tag: `div_${shortId(divisionId)}`,
        expectedName: divisionRoleName(division?.name, divisionId),
        expectedPermissions: PERMS_NONE,
        expectedPriority: PRIORITY_DIVISION,
      });
    }
    for (const department of departments) {
      const departmentId = department?._id || department?.id;
      if (!departmentId) continue;
      await ensureRoleByTag(organizationId, roles, {
        tag: `dep_${shortId(departmentId)}`,
        expectedName: departmentRoleName(department?.name, departmentId),
        expectedPermissions: PERMS_NONE,
        expectedPriority: PRIORITY_DEPARTMENT,
      });
    }
    for (const team of teams) {
      const teamId = team?._id || team?.id;
      if (!teamId) continue;
      await ensureRoleByTag(organizationId, roles, {
        tag: `team_${shortId(teamId)}`,
        expectedName: teamRoleName(team?.name, teamId),
        expectedPermissions: PERMS_NONE,
        expectedPriority: PRIORITY_TEAM,
      });
    }
  } catch (error) {
    logger.warn('[hierarchyRoleSync] syncHierarchyRoles failed', error.message);
  }
}

module.exports = {
  ensureDivisionRole,
  ensureDepartmentRole,
  ensureTeamRole,
  syncHierarchyRoles,
};
