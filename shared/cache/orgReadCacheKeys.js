/** Convention Redis org read cache — organization-service ghi, chat-service đọc. */

function orgAclCacheKey(orgId, userId) {
  return `org:${String(orgId)}:acl:${String(userId)}`;
}

function orgStructureSummaryCacheKey(orgId) {
  return `org:${String(orgId)}:structure:summary`;
}

function orgAclCachePattern(orgId) {
  return `org:${String(orgId)}:acl:*`;
}

function orgShellVersionCacheKey(orgId) {
  return `org:${String(orgId)}:shell:version`;
}

const DEFAULT_ORG_ACL_CACHE_TTL_SEC = 180;
const DEFAULT_ORG_STRUCTURE_CACHE_TTL_SEC = 600;

module.exports = {
  orgAclCacheKey,
  orgStructureSummaryCacheKey,
  orgShellVersionCacheKey,
  orgAclCachePattern,
  DEFAULT_ORG_ACL_CACHE_TTL_SEC,
  DEFAULT_ORG_STRUCTURE_CACHE_TTL_SEC,
};
