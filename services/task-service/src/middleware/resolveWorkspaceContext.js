const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('/shared/middleware/gatewayTrust');

const ORGANIZATION_SERVICE_URL = (process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013').replace(
  /\/$/,
  ''
);

/** Cache slug → organizationId theo request (không share giữa request). */
const slugCache = new WeakMap();

async function fetchOrganizationIdBySlug(userId, slug) {
  const res = await axios.get(
    `${ORGANIZATION_SERVICE_URL}/api/organizations/by-slug/${encodeURIComponent(slug)}`,
    {
      headers: buildTrustedGatewayHeaders(userId),
      timeout: 12000,
      validateStatus: () => true,
    }
  );
  if (res.status === 404) {
    const err = new Error('Workspace không tồn tại');
    err.statusCode = 404;
    err.errorCode = 'WORKSPACE_NOT_FOUND';
    throw err;
  }
  if (res.status === 403) {
    const err = new Error('Không có quyền truy cập workspace');
    err.statusCode = 403;
    err.errorCode = 'WORKSPACE_ACCESS_DENIED';
    throw err;
  }
  if (res.status !== 200) {
    const err = new Error('Không thể xác thực workspace');
    err.statusCode = 502;
    err.errorCode = 'WORKSPACE_RESOLVE_FAILED';
    throw err;
  }
  const org = res.data?.data ?? res.data;
  const organizationId = String(org?._id || org?.id || '').trim();
  if (!organizationId) {
    const err = new Error('Workspace không hợp lệ');
    err.statusCode = 502;
    err.errorCode = 'WORKSPACE_RESOLVE_INVALID';
    throw err;
  }
  return organizationId;
}

/**
 * Resolve :workspaceSlug → organizationId qua organization-service.
 * Inject organizationId vào query/body để controller board hiện tại dùng được.
 */
async function resolveWorkspaceContext(req, res, next) {
  try {
    const userId = req.user?.id || req.userContext?.userId || '';
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const slug = String(req.params.workspaceSlug || '')
      .trim()
      .toLowerCase();
    if (!slug || slug.length < 2) {
      return res.status(400).json({ success: false, message: 'workspaceSlug không hợp lệ' });
    }

    let cacheForReq = slugCache.get(req);
    if (!cacheForReq) {
      cacheForReq = new Map();
      slugCache.set(req, cacheForReq);
    }

    let organizationId = cacheForReq.get(slug);
    if (!organizationId) {
      organizationId = await fetchOrganizationIdBySlug(userId, slug);
      cacheForReq.set(slug, organizationId);
    }

    req.workspaceContext = { organizationId, slug };

    if (!req.query.organizationId) {
      req.query.organizationId = organizationId;
    }
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body) && !req.body.organizationId) {
      req.body.organizationId = organizationId;
    }

    return next();
  } catch (err) {
    const status = Number(err?.statusCode) || 502;
    return res.status(status).json({
      success: false,
      message: String(err?.message || 'Không thể xác thực workspace'),
      errorCode: String(err?.errorCode || 'WORKSPACE_RESOLVE_FAILED'),
      messageUser: String(err?.message || 'Không thể xác thực workspace'),
    });
  }
}

module.exports = resolveWorkspaceContext;
