const ROLE_PERMISSION_SERVICE_URL = String(process.env.ROLE_PERMISSION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ROLE_PERMISSION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ROLE_PERMISSION_SERVICE_URL');
const axios = require('axios');
const { logger } = require('/shared');
const { invalidateOrgAcl } = require('./orgReadCache.service');
const { ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');

const ROLE_PERMISSION_BASE = process.env.ROLE_PERMISSION_SERVICE_URL;
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

const ORG_ROLE_ADMIN = 'Quản trị viên';
const ORG_ROLE_HR = 'Nhân sự';
const ORG_ROLE_MEMBER = 'Thành viên';

const PERMS_MEMBER = [
  { resource: 'chat', actions: ['read', 'write'] },
  { resource: 'task', actions: ['read'] },
  { resource: 'role', actions: ['read'] },
];

const PERMS_HR = [
  { resource: 'chat', actions: ['read', 'write'] },
  { resource: 'task', actions: ['read'] },
  { resource: 'organization_member', actions: ['read', 'write'] },
  { resource: 'role', actions: ['read'] },
];

const PERMS_ADMIN = [
  { resource: 'chat', actions: ['read', 'write', 'delete'] },
  { resource: 'task', actions: ['read', 'write'] },
  { resource: 'document', actions: ['read', 'write'] },
  { resource: 'voice', actions: ['read', 'write'] },
  { resource: 'organization', actions: ['read'] },
  { resource: 'role', actions: ['read', 'write', 'delete', 'admin'] },
];

function internalHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (GATEWAY_INTERNAL_TOKEN) h['x-gateway-internal-token'] = GATEWAY_INTERNAL_TOKEN;
  return h;
}

function orgContextId(organizationId) {
  return String(organizationId);
}

/**
 * Đảm bảo 2 role mặc định cấp tổ chức tồn tại trong role-permission-service.
 * Dùng serverId = organizationId = _id tổ chức (RBAC theo ngữ cảnh gateway).
 */
async function ensureDefaultOrgRoles(organizationId) {
  const oid = orgContextId(organizationId);
  if (!oid || !GATEWAY_INTERNAL_TOKEN) {
    if (!GATEWAY_INTERNAL_TOKEN) {
      logger.warn('[rolePermissionOrgSync] GATEWAY_INTERNAL_TOKEN missing — skip role sync');
    }
    return;
  }

  try {
    const listRes = await axios.get(`${ROLE_PERMISSION_BASE}/api/roles/server/${encodeURIComponent(oid)}`, {
      headers: internalHeaders(),
      timeout: 8000,
      validateStatus: () => true,
    });
    const existing = Array.isArray(listRes.data?.data) ? listRes.data.data : [];
    const byName = new Map(existing.map((r) => [r.name, r]));

    async function createIfMissing(name, permissions, extra = {}) {
      if (byName.has(name)) return;
      const body = {
        name,
        serverId: oid,
        organizationId: oid,
        permissions,
        isDefault: name === ORG_ROLE_MEMBER,
        priority: name === ORG_ROLE_ADMIN ? 200 : name === ORG_ROLE_HR ? 180 : 20,
        ...extra,
      };
      const res = await axios.post(`${ROLE_PERMISSION_BASE}/api/roles`, body, {
        headers: internalHeaders(),
        timeout: 8000,
        validateStatus: () => true,
      });
      if (res.status === 201 && res.data?.data?._id) {
        byName.set(name, res.data.data);
        return;
      }
      const errMsg = String(res.data?.message || '');
      if (res.status === 400 && (errMsg.includes('already exists') || errMsg.includes('already'))) {
        return;
      }
      logger.warn('[rolePermissionOrgSync] createRole failed', {
        name,
        status: res.status,
        message: res.data?.message,
      });
    }

    await createIfMissing(ORG_ROLE_ADMIN, PERMS_ADMIN);
    await createIfMissing(ORG_ROLE_HR, PERMS_HR);
    await createIfMissing(ORG_ROLE_MEMBER, PERMS_MEMBER);

    await axios.post(
      `${ROLE_PERMISSION_BASE}/api/internal/roles/backfill-role-read/${encodeURIComponent(oid)}`,
      {},
      { headers: internalHeaders(), timeout: 12000, validateStatus: () => true }
    );
  } catch (e) {
    logger.warn('[rolePermissionOrgSync] ensureDefaultOrgRoles', e.message);
  }
}

async function fetchRoleTemplates(organizationId) {
  const oid = orgContextId(organizationId);
  const res = await axios.get(`${ROLE_PERMISSION_BASE}/api/roles/server/${encodeURIComponent(oid)}`, {
    headers: internalHeaders(),
    timeout: 8000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !Array.isArray(res.data?.data)) {
    return { adminId: null, hrId: null, memberId: null };
  }
  const list = res.data.data;
  const admin = list.find((r) => r.name === ORG_ROLE_ADMIN);
  const hr = list.find((r) => r.name === ORG_ROLE_HR);
  const member = list.find((r) => r.name === ORG_ROLE_MEMBER);
  return { adminId: admin?._id || null, hrId: hr?._id || null, memberId: member?._id || null };
}

/** Gỡ mọi UserRole của user trong ngữ cảnh org (serverId = organizationId). */
async function stripUserOrgRoles(userId, organizationId) {
  const uid = String(userId);
  const oid = orgContextId(organizationId);
  if (!uid || !oid || !GATEWAY_INTERNAL_TOKEN) return;

  try {
    const res = await axios.get(
      `${ROLE_PERMISSION_BASE}/api/roles/user/${encodeURIComponent(uid)}/server/${encodeURIComponent(oid)}`,
      { headers: internalHeaders(), timeout: 8000, validateStatus: () => true }
    );
    const roles = Array.isArray(res.data?.data) ? res.data.data : [];
    for (const role of roles) {
      const roleId = role?._id || role;
      if (!roleId) continue;
      await axios.post(
        `${ROLE_PERMISSION_BASE}/api/roles/remove`,
        { userId: uid, serverId: oid, roleId: String(roleId) },
        { headers: internalHeaders(), timeout: 8000, validateStatus: () => true }
      );
    }
  } catch (e) {
    logger.warn('[rolePermissionOrgSync] stripUserOrgRoles', e.message);
  }
}

/**
 * membershipRole: owner | admin | member (Membership organization-service)
 */
async function syncUserOrgRole(userId, organizationId, membershipRole) {
  const uid = String(userId);
  const oid = orgContextId(organizationId);
  if (!uid || !oid || !GATEWAY_INTERNAL_TOKEN) return;

  const normalized = String(membershipRole || 'member').toLowerCase();
  const useAdmin = normalized === 'owner' || normalized === 'admin';
  const useHr = normalized === 'hr';

  try {
    await ensureDefaultOrgRoles(oid);
    await stripUserOrgRoles(uid, oid);
    const { adminId, hrId, memberId } = await fetchRoleTemplates(oid);
    const chosen = useAdmin ? adminId : useHr ? hrId : memberId;
    const roleId = chosen != null ? String(chosen) : '';
    if (!roleId || roleId === 'null' || roleId === 'undefined') {
      logger.warn('[rolePermissionOrgSync] syncUserOrgRole: no template role id', { oid, useAdmin });
      return;
    }
    const assignRes = await axios.post(
      `${ROLE_PERMISSION_BASE}/api/roles/assign`,
      { userId: uid, serverId: oid, roleId },
      { headers: internalHeaders(), timeout: 8000, validateStatus: () => true }
    );
    if (assignRes.status === 201) {
      await invalidateOrgAcl(oid, uid, { eventType: ORG_EVENT_TYPES.ROLE_UPDATED });
      return;
    }
    const msg = String(assignRes.data?.message || '');
    if (msg.includes('already has')) {
      await invalidateOrgAcl(oid, uid, { eventType: ORG_EVENT_TYPES.ROLE_UPDATED });
      return;
    }
    logger.warn('[rolePermissionOrgSync] assign failed', { status: assignRes.status, message: msg });
  } catch (e) {
    logger.warn('[rolePermissionOrgSync] syncUserOrgRole', e.message);
  }
}

module.exports = {
  ensureDefaultOrgRoles,
  stripUserOrgRoles,
  syncUserOrgRole,
  ORG_ROLE_ADMIN,
  ORG_ROLE_HR,
  ORG_ROLE_MEMBER,
};
