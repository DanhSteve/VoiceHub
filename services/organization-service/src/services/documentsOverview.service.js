const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('/shared/middleware/gatewayTrust');
const Organization = require('../models/Organization');
const { resolveOrgAccess } = require('../utils/orgAccess');
const { getCachedAccessibleChannelData, getCachedOrganizationStructureData } = require('./orgReadCache.service');
const {
  buildAccessibleChannelData,
  buildOrganizationStructureData,
} = require('./orgShellData.service');

const CHAT_SERVICE_URL = String(process.env.CHAT_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!CHAT_SERVICE_URL) throw new Error('Thiếu biến môi trường: CHAT_SERVICE_URL');
const DOCUMENT_SERVICE_URL = String(process.env.DOCUMENT_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!DOCUMENT_SERVICE_URL) throw new Error('Thiếu biến môi trường: DOCUMENT_SERVICE_URL');

const MAX_ATTACHMENT_PAGES = Math.min(
  12,
  Math.max(1, Number(process.env.ORG_DOCUMENTS_ATTACHMENT_MAX_PAGES || 4))
);
const PAGE_LIMIT = Math.min(100, Math.max(10, Number(process.env.ORG_DOCUMENTS_PAGE_LIMIT || 40)));
const ATTACHMENT_BUDGET_MS = Math.min(
  90000,
  Math.max(8000, Number(process.env.ORG_DOCUMENTS_ATTACHMENT_BUDGET_MS || 32000))
);

async function fetchAttachmentMessages(orgId, userId, allowedRoomIds = []) {
  const headers = {
    ...buildTrustedGatewayHeaders(userId),
    'x-vh-org-documents-internal': '1',
  };
  const roomIdsCsv = (Array.isArray(allowedRoomIds) ? allowedRoomIds : [])
    .map(String)
    .filter(Boolean)
    .join(',');
  const all = [];
  let pageToken = null;
  let pages = 0;
  let truncated = false;
  let lastHasMore = false;
  const startedAt = Date.now();

  while (pages < MAX_ATTACHMENT_PAGES) {
    if (Date.now() - startedAt > ATTACHMENT_BUDGET_MS) {
      truncated = true;
      break;
    }
    const params = {
      organizationId: String(orgId),
      hasAttachment: true,
      limit: PAGE_LIMIT,
      fields: 'summary',
    };
    if (roomIdsCsv) params.allowedRoomIds = roomIdsCsv;
    if (pageToken) params.pageToken = pageToken;

    const res = await axios.get(`${CHAT_SERVICE_URL}/api/messages/search`, {
      params,
      headers,
      timeout: Number(process.env.ORG_DOCUMENTS_CHAT_TIMEOUT_MS || 20000),
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      const err = new Error(
        res.data?.message || `Chat search failed (${res.status})`
      );
      err.statusCode = res.status >= 500 ? 502 : res.status;
      throw err;
    }
    const result = res.data?.data ?? res.data;
    const messages = Array.isArray(result?.messages) ? result.messages : [];
    all.push(...messages);
    pages += 1;
    lastHasMore = Boolean(result?.hasMore && result?.nextPageToken);
    if (!lastHasMore || messages.length === 0) break;
    pageToken = result.nextPageToken;
  }

  if (!truncated && lastHasMore) truncated = true;

  return { messages: all, truncated };
}

async function fetchLibraryDocuments(orgId, userId) {
  const headers = buildTrustedGatewayHeaders(userId);
  const res = await axios.get(`${DOCUMENT_SERVICE_URL}/api/documents`, {
    params: { organizationId: String(orgId), limit: 100 },
    headers,
    timeout: Number(process.env.ORG_DOCUMENTS_DOC_TIMEOUT_MS || 12000),
    validateStatus: () => true,
  });
  if (res.status >= 400) return [];
  const body = res.data?.data ?? res.data;
  if (Array.isArray(body?.documents)) return body.documents;
  if (Array.isArray(body)) return body;
  return [];
}

async function buildDocumentsOverview(orgId, userId) {
  const oid = String(orgId || '').trim();
  const uid = String(userId || '').trim();
  if (!oid || !uid) {
    const err = new Error('organizationId and userId are required');
    err.statusCode = 400;
    throw err;
  }

  const access = await resolveOrgAccess(uid, oid);
  if (!access.ok) {
    const err = new Error('Access denied');
    err.statusCode = 403;
    err.code = 'ORG_ACCESS_DENIED';
    throw err;
  }

  const [structureData, accessData, orgDoc] = await Promise.all([
    getCachedOrganizationStructureData(oid, buildOrganizationStructureData),
    getCachedAccessibleChannelData(uid, oid, access, buildAccessibleChannelData),
    Organization.findById(oid).select('name slug logo').lean(),
  ]);

  const allowedRoomIds = Array.isArray(accessData?.channelIds)
    ? accessData.channelIds.map(String)
    : [];

  const [attachmentResult, libraryDocuments] = await Promise.all([
    allowedRoomIds.length
      ? fetchAttachmentMessages(oid, uid, allowedRoomIds)
      : Promise.resolve({ messages: [], truncated: false }),
    fetchLibraryDocuments(oid, uid),
  ]);
  const attachmentMessages = attachmentResult?.messages || [];
  const attachmentsTruncated = Boolean(attachmentResult?.truncated);

  return {
    orgName: orgDoc?.name || '',
    organization: {
      id: oid,
      name: orgDoc?.name || '',
      slug: orgDoc?.slug || '',
      icon: orgDoc?.logo || null,
    },
    branches: structureData?.branches || [],
    provisioning: structureData?.provisioning || null,
    attachmentMessages,
    libraryDocuments,
    hasMore: attachmentsTruncated,
    nextPageToken: null,
  };
}

module.exports = { buildDocumentsOverview };
