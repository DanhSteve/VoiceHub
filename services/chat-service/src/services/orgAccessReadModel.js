const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('/shared/middleware/gatewayTrust');
const UserOrgChannelAccess = require('../models/UserOrgChannelAccess');
const {
  readOrgAclFromRedis,
  writeOrgAclToRedis,
  deleteOrgAclFromRedis,
  purgeOrgAclRedisForOrg,
  resolveUserIdFromReq,
} = require('../utils/orgAclCacheRead');
const orgServiceCircuit = require('./orgServiceCircuit');

const LOCAL_FRESH_MS = Math.max(
  60_000,
  Number(process.env.ORG_ACL_LOCAL_FRESH_MS || 5 * 60 * 1000)
);
const ORG_HTTP_TIMEOUT_MS = Number(process.env.ORG_ACCESSIBLE_CHANNELS_TIMEOUT_MS || 12000);

function normalizeAclPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return { channelIds: [], permissionsByChannelId: {}, scope: null };
  }
  return {
    channelIds: Array.isArray(raw.channelIds) ? raw.channelIds.map(String) : [],
    permissionsByChannelId:
      raw.permissionsByChannelId && typeof raw.permissionsByChannelId === 'object'
        ? raw.permissionsByChannelId
        : {},
    scope: raw.scope != null ? raw.scope : null,
  };
}

function docToPayload(doc) {
  if (!doc) return null;
  return normalizeAclPayload({
    channelIds: doc.channelIds,
    permissionsByChannelId: doc.permissionsByChannelId,
    scope: doc.scope,
  });
}

function headersForOrganizationForward(req) {
  const headers = {};
  const uid = String(req.user?.id || req.user?.userId || req.user?._id || '').trim();
  const gwTok = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (uid && gwTok) {
    Object.assign(headers, buildTrustedGatewayHeaders(uid));
  } else {
    const fx = req.headers['x-user-id'];
    const fgw = String(req.headers['x-gateway-internal-token'] || '').trim();
    if (fx && fgw) {
      headers['x-user-id'] = String(fx).trim();
      headers['x-gateway-internal-token'] = fgw;
      const em = req.headers['x-user-email'];
      if (em) headers['x-user-email'] = em;
    }
  }
  const auth = req.headers?.authorization;
  if (auth) headers.Authorization = auth;
  return headers;
}

async function readLocalFresh(orgId, userId) {
  const row = await UserOrgChannelAccess.findOne({
    userId: String(userId),
    organizationId: String(orgId),
  }).lean();
  if (!row?.updatedAt) return null;
  const age = Date.now() - new Date(row.updatedAt).getTime();
  if (age > LOCAL_FRESH_MS) return null;
  return docToPayload(row);
}

async function readLocalStale(orgId, userId) {
  const row = await UserOrgChannelAccess.findOne({
    userId: String(userId),
    organizationId: String(orgId),
  }).lean();
  return docToPayload(row);
}

async function upsertLocal(orgId, userId, payload) {
  const normalized = normalizeAclPayload(payload);
  await UserOrgChannelAccess.findOneAndUpdate(
    { userId: String(userId), organizationId: String(orgId) },
    {
      userId: String(userId),
      organizationId: String(orgId),
      channelIds: normalized.channelIds,
      permissionsByChannelId: normalized.permissionsByChannelId,
      scope: normalized.scope,
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return normalized;
}

async function fetchFromOrganizationService(orgId, req) {
  const base = (process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013').replace(
    /\/$/,
    ''
  );
  const url = `${base}/api/organizations/${orgId}/accessible-channel-ids`;
  const { data } = await axios.get(url, {
    headers: headersForOrganizationForward(req),
    timeout: ORG_HTTP_TIMEOUT_MS,
  });
  return normalizeAclPayload(data?.data ?? data);
}

/**
 * Redis (2b) → Mongo local fresh → HTTP org (một lần) → upsert local + Redis.
 */
async function resolveOrgChannelAccess(orgId, req) {
  const userId = resolveUserIdFromReq(req);
  const oid = String(orgId || '').trim();
  if (!oid || !userId) {
    const err = new Error('organizationId và userId là bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  const fromRedis = await readOrgAclFromRedis(oid, userId);
  if (fromRedis) return normalizeAclPayload(fromRedis);

  const fromLocal = await readLocalFresh(oid, userId);
  if (fromLocal) {
    await writeOrgAclToRedis(oid, userId, fromLocal);
    return fromLocal;
  }

  if (orgServiceCircuit.isOpen()) {
    const stale = await readLocalStale(oid, userId);
    if (stale) return stale;
    throw orgServiceCircuit.createCircuitOpenError();
  }

  try {
    const remote = await fetchFromOrganizationService(oid, req);
    orgServiceCircuit.recordSuccess();
    await upsertLocal(oid, userId, remote);
    await writeOrgAclToRedis(oid, userId, remote);
    return remote;
  } catch (e) {
    orgServiceCircuit.recordFailure();
    if (orgServiceCircuit.isOpen() || e.response?.status >= 500 || !e.response) {
      const stale = await readLocalStale(oid, userId);
      if (stale) return stale;
      if (orgServiceCircuit.isOpen()) {
        throw orgServiceCircuit.createCircuitOpenError();
      }
    }
    const err = new Error(
      e.response?.data?.message || e.message || 'Không thể tải quyền kênh tổ chức'
    );
    err.statusCode = e.response?.status || 502;
    err.code = 'ORG_ACL_FETCH_FAILED';
    throw err;
  }
}

async function invalidateLocalOrgAcl(orgId, userId = null) {
  const oid = String(orgId || '').trim();
  if (!oid) return;
  if (userId) {
    const uid = String(userId);
    await UserOrgChannelAccess.deleteOne({ userId: uid, organizationId: oid });
    await deleteOrgAclFromRedis(oid, uid);
    return;
  }
  await UserOrgChannelAccess.deleteMany({ organizationId: oid });
  await purgeOrgAclRedisForOrg(oid);
}

module.exports = {
  resolveOrgChannelAccess,
  invalidateLocalOrgAcl,
  normalizeAclPayload,
  resolveUserIdFromReq,
};
