const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('/shared/middleware/gatewayTrust');

const ORGANIZATION_SERVICE_URL = (process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013').replace(
  /\/$/,
  ''
);

async function fetchTaskWorkspaceScope(userId, organizationId) {
  if (!userId || !organizationId) return null;
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/${encodeURIComponent(String(organizationId))}/task-workspace-scope`,
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 12000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200) return null;
    const body = res.data?.data ?? res.data;
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

function buildTaskVisibilityFilter(scope, userId) {
  const uid = String(userId || '');
  const base = { isActive: true };
  if (!scope || !scope.visibility) {
    return { ...base, assigneeId: uid };
  }

  switch (scope.visibility) {
    case 'org':
      return base;
    case 'division': {
      const or = [];
      const divIds = Array.isArray(scope.divisionIds) ? scope.divisionIds.map(String) : [];
      const deptIds = Array.isArray(scope.departmentIds) ? scope.departmentIds.map(String) : [];
      const teamIds = Array.isArray(scope.teamIds) ? scope.teamIds.map(String) : [];
      const assignees = Array.isArray(scope.assignableUserIds)
        ? scope.assignableUserIds.map(String)
        : [];
      if (divIds.length) or.push({ divisionId: { $in: divIds } });
      if (deptIds.length) or.push({ departmentId: { $in: deptIds } });
      if (teamIds.length) or.push({ teamId: { $in: teamIds } });
      if (assignees.length) or.push({ assigneeId: { $in: assignees } });
      if (!or.length) return { ...base, assigneeId: uid };
      return { ...base, $or: or };
    }
    case 'department': {
      const or = [];
      const deptIds = Array.isArray(scope.departmentIds) ? scope.departmentIds.map(String) : [];
      const teamIds = Array.isArray(scope.teamIds) ? scope.teamIds.map(String) : [];
      const assignees = Array.isArray(scope.assignableUserIds)
        ? scope.assignableUserIds.map(String)
        : [];
      if (deptIds.length) or.push({ departmentId: { $in: deptIds } });
      if (teamIds.length) or.push({ teamId: { $in: teamIds } });
      if (assignees.length) or.push({ assigneeId: { $in: assignees } });
      if (!or.length) return { ...base, assigneeId: uid };
      return { ...base, $or: or };
    }
    case 'team': {
      const or = [];
      const teamIds = Array.isArray(scope.teamIds) ? scope.teamIds.map(String) : [];
      const assignees = Array.isArray(scope.assignableUserIds)
        ? scope.assignableUserIds.map(String)
        : [];
      if (teamIds.length) or.push({ teamId: { $in: teamIds } });
      if (assignees.length) or.push({ assigneeId: { $in: assignees } });
      if (!or.length) return { ...base, assigneeId: uid };
      return { ...base, $or: or };
    }
    case 'self':
    default:
      return {
        ...base,
        $or: [{ assigneeId: uid }, { createdBy: uid }],
      };
  }
}

function canCreateTaskInScope(scope) {
  return Boolean(scope?.canCreateTask);
}

function canAssignUser(scope, assigneeId) {
  if (!assigneeId) return true;
  if (!scope) return false;
  if (scope.visibility === 'org') return true;
  const allowed = new Set((scope.assignableUserIds || []).map(String));
  return allowed.has(String(assigneeId));
}

function userCanAccessTask(task, userId, scope) {
  const uid = String(userId || '');
  if (!task || !uid) return false;
  if (String(task.createdBy) === uid) return true;
  if (task.assigneeId && String(task.assigneeId) === uid) return true;
  if (!scope) return false;
  if (scope.visibility === 'org') return true;

  const assigneeId = task.assigneeId ? String(task.assigneeId) : '';
  const deptId = task.departmentId ? String(task.departmentId) : '';
  const teamId = task.teamId ? String(task.teamId) : '';

  if (scope.visibility === 'department') {
    const deptIds = new Set((scope.departmentIds || []).map(String));
    const teamIds = new Set((scope.teamIds || []).map(String));
    const assignees = new Set((scope.assignableUserIds || []).map(String));
    if (deptId && deptIds.has(deptId)) return true;
    if (teamId && teamIds.has(teamId)) return true;
    if (assigneeId && assignees.has(assigneeId)) return true;
    return false;
  }

  if (scope.visibility === 'division') {
    const divIds = new Set((scope.divisionIds || []).map(String));
    const deptIds = new Set((scope.departmentIds || []).map(String));
    const teamIds = new Set((scope.teamIds || []).map(String));
    const assignees = new Set((scope.assignableUserIds || []).map(String));
    const divId = task.divisionId ? String(task.divisionId) : '';
    if (divId && divIds.has(divId)) return true;
    if (deptId && deptIds.has(deptId)) return true;
    if (teamId && teamIds.has(teamId)) return true;
    if (assigneeId && assignees.has(assigneeId)) return true;
    return false;
  }

  if (scope.visibility === 'team') {
    const teamIds = new Set((scope.teamIds || []).map(String));
    const assignees = new Set((scope.assignableUserIds || []).map(String));
    if (teamId && teamIds.has(teamId)) return true;
    if (assigneeId && assignees.has(assigneeId)) return true;
    return false;
  }

  return assigneeId === uid;
}

module.exports = {
  fetchTaskWorkspaceScope,
  buildTaskVisibilityFilter,
  canCreateTaskInScope,
  canAssignUser,
  userCanAccessTask,
};
