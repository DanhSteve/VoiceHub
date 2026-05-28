function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return Boolean(fallback);
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

const RBAC_MULTI_PLACEMENT_READ = envFlag('RBAC_MULTI_PLACEMENT_READ', false);
const RBAC_MULTI_PLACEMENT_WRITE = envFlag('RBAC_MULTI_PLACEMENT_WRITE', false);
const TASKBOARD_SCOPE_RBAC_V2 = envFlag('TASKBOARD_SCOPE_RBAC_V2', false);

module.exports = {
  RBAC_MULTI_PLACEMENT_READ,
  RBAC_MULTI_PLACEMENT_WRITE,
  TASKBOARD_SCOPE_RBAC_V2,
};
