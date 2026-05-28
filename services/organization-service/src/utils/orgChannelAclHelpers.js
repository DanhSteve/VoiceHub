function normalizeRoleChannelPermissions(raw = {}) {
  return {
    canSee: Boolean(raw.canSee),
    canRead: Boolean(raw.canRead),
    canWrite: Boolean(raw.canWrite),
    canDelete: Boolean(raw.canDelete),
    canVoice: Boolean(raw.canVoice),
  };
}

function mergeRoleChannelPermissions(acc, next) {
  return {
    canSee: acc.canSee || next.canSee,
    canRead: acc.canRead || next.canRead,
    canWrite: acc.canWrite || next.canWrite,
    canDelete: acc.canDelete || next.canDelete,
    canVoice: acc.canVoice || next.canVoice,
  };
}

function hasAnyRoleChannelPermission(permissions) {
  const p = normalizeRoleChannelPermissions(permissions);
  return p.canSee || p.canRead || p.canWrite || p.canDelete || p.canVoice;
}

function buildScopeRoleAclMap(rows, userRoleIds) {
  const byScopeId = new Map();
  for (const row of rows || []) {
    if (!userRoleIds.has(String(row.roleId))) continue;
    const scopeKey = String(row.scopeId);
    const roleKey = String(row.roleId);
    if (!byScopeId.has(scopeKey)) byScopeId.set(scopeKey, new Map());
    const roleMap = byScopeId.get(scopeKey);
    const prev = roleMap.get(roleKey) || {
      canSee: false,
      canRead: false,
      canWrite: false,
      canDelete: false,
      canVoice: false,
    };
    roleMap.set(
      roleKey,
      mergeRoleChannelPermissions(prev, normalizeRoleChannelPermissions(row.permissions))
    );
  }
  return byScopeId;
}

function buildChannelRoleAclMap(rows, userRoleIds) {
  const byChannelId = new Map();
  for (const row of rows || []) {
    if (!userRoleIds.has(String(row.roleId))) continue;
    const channelKey = String(row.channel);
    const roleKey = String(row.roleId);
    if (!byChannelId.has(channelKey)) byChannelId.set(channelKey, new Map());
    const roleMap = byChannelId.get(channelKey);
    const prev = roleMap.get(roleKey) || {
      canSee: false,
      canRead: false,
      canWrite: false,
      canDelete: false,
      canVoice: false,
    };
    roleMap.set(
      roleKey,
      mergeRoleChannelPermissions(prev, normalizeRoleChannelPermissions(row.permissions))
    );
  }
  return byChannelId;
}

function resolveEffectiveRolePerm(
  channelRoleMap,
  divisionRoleMap,
  departmentRoleMap,
  teamRoleMap,
  channel,
  roleId
) {
  const explicitOnly =
    String(process.env.RBAC_EXPLICIT_SCOPE_ONLY || 'false').toLowerCase() === 'true';
  const channelKey = String(channel._id);
  const fromChannel = channelRoleMap.get(channelKey)?.get(roleId);
  if (fromChannel && hasAnyRoleChannelPermission(fromChannel)) return fromChannel;

  const teamKey = String(channel.team || '');
  const fromTeam = teamKey ? teamRoleMap.get(teamKey)?.get(roleId) : null;
  if (fromTeam && hasAnyRoleChannelPermission(fromTeam)) return fromTeam;
  if (explicitOnly && teamKey) return null;

  const depKey = String(channel.department || '');
  const fromDept = depKey ? departmentRoleMap.get(depKey)?.get(roleId) : null;
  if (fromDept && hasAnyRoleChannelPermission(fromDept)) return fromDept;
  if (explicitOnly && depKey) return null;

  const divKey = String(channel.division || '');
  const fromDiv = divKey ? divisionRoleMap.get(divKey)?.get(roleId) : null;
  if (fromDiv && hasAnyRoleChannelPermission(fromDiv)) return fromDiv;

  return null;
}

function hasExecutiveRbacRole(roleNames) {
  return (roleNames || []).some((name) => {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return false;
    if (n.includes('quản trị') || n.includes('quan tri') || n.includes('administrator')) {
      return true;
    }
    if (n === 'admin' || n.includes('owner') || n.includes('chủ sở')) return true;
    if (n === 'hr' || n.includes('nhân sự') || n.includes('nhan su')) return true;
    return false;
  });
}

module.exports = {
  normalizeRoleChannelPermissions,
  mergeRoleChannelPermissions,
  hasAnyRoleChannelPermission,
  buildScopeRoleAclMap,
  buildChannelRoleAclMap,
  resolveEffectiveRolePerm,
  hasExecutiveRbacRole,
};
