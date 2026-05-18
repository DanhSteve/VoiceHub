const axios = require('axios');
const { mongoose } = require('/shared/config/mongo');
const { getRedisClient, logger } = require('/shared');
const Membership = require('../models/Membership');
const JoinApplication = require('../models/JoinApplication');
const Channel = require('../models/Channel');
const Department = require('../models/Department');
const Branch = require('../models/Branch');
const Division = require('../models/Division');
const Team = require('../models/Team');
const Server = require('../models/Server');
const Organization = require('../models/Organization');
const ChannelAccess = require('../models/ChannelAccess');
const ChannelRoleAccess = require('../models/ChannelRoleAccess');

const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
const CHAT_INTERNAL_TOKEN = String(process.env.CHAT_INTERNAL_TOKEN || '').trim();

const TASK_SERVICE_URL = (process.env.TASK_SERVICE_URL || 'http://task-service:3009').replace(/\/$/, '');
const DOCUMENT_SERVICE_URL = (process.env.DOCUMENT_SERVICE_URL || 'http://document-service:3010').replace(/\/$/, '');
const VOICE_SERVICE_URL = (process.env.VOICE_SERVICE_URL || 'http://voice-service:3005').replace(/\/$/, '');
const CHAT_SERVICE_URL = (process.env.CHAT_SERVICE_URL || 'http://chat-service:3006').replace(/\/$/, '');
const AI_TASK_SERVICE_URL = (process.env.AI_TASK_SERVICE_URL || 'http://ai-task-service:3020').replace(/\/$/, '');
const ROLE_PERMISSION_SERVICE_URL = (process.env.ROLE_PERMISSION_SERVICE_URL || 'http://role-permission-service:3015').replace(
  /\/$/,
  ''
);
const PURGE_MAX_RETRIES = 5;
const PURGE_RETRY_DELAY_MS = 2000;

function gatewayHeaders() {
  const h = { 'Content-Type': 'application/json' };
  h['x-gateway-internal-token'] = GATEWAY_INTERNAL_TOKEN;
  return h;
}

function chatHeaders() {
  const h = { 'Content-Type': 'application/json' };
  h['x-chat-internal-token'] = CHAT_INTERNAL_TOKEN;
  return h;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetryStatus = (status) => [500, 502, 503, 504].includes(Number(status));

const shouldRetryNetworkError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  return ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND'].includes(code);
};

async function requestWithRetry(requestFn, errorPrefix, { maxRetries = PURGE_MAX_RETRIES } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await requestFn();
      if (res.status === 200) {
        return res;
      }
      const err = new Error(`${errorPrefix}: HTTP ${res.status} ${JSON.stringify(res.data)}`);
      err.status = res.status;
      lastError = err;
      if (!shouldRetryStatus(res.status) || attempt === maxRetries) {
        throw err;
      }
      logger.warn(`${errorPrefix} retry ${attempt}/${maxRetries} (status=${res.status})`);
      await sleep(PURGE_RETRY_DELAY_MS * attempt);
    } catch (error) {
      lastError = error;
      if (!shouldRetryNetworkError(error) || attempt === maxRetries) {
        throw error;
      }
      logger.warn(`${errorPrefix} retry ${attempt}/${maxRetries} (network=${error.code || 'unknown'})`);
      await sleep(PURGE_RETRY_DELAY_MS * attempt);
    }
  }
  throw lastError || new Error(`${errorPrefix}: unknown error`);
}

async function purgeRemoteTasks(organizationId) {
  const url = `${TASK_SERVICE_URL}/api/tasks/internal/purge-organization/${encodeURIComponent(organizationId)}`;
  await requestWithRetry(
    () => axios.delete(url, { headers: gatewayHeaders(), timeout: 120000, validateStatus: () => true }),
    'task-service purge'
  );
}

async function purgeRemoteDocuments(organizationId) {
  const url = `${DOCUMENT_SERVICE_URL}/internal/documents/purge-organization/${encodeURIComponent(organizationId)}`;
  await requestWithRetry(
    () => axios.delete(url, { headers: gatewayHeaders(), timeout: 120000, validateStatus: () => true }),
    'document-service purge'
  );
}

async function purgeRemoteMeetings(organizationId) {
  const url = `${VOICE_SERVICE_URL}/api/meetings/internal/purge-organization/${encodeURIComponent(organizationId)}`;
  await requestWithRetry(
    () => axios.delete(url, { headers: gatewayHeaders(), timeout: 120000, validateStatus: () => true }),
    'voice-service purge'
  );
}

async function purgeRemoteChatMessages(organizationId) {
  const url = `${CHAT_SERVICE_URL}/api/messages/internal/purge-organization-messages`;
  await requestWithRetry(
    () =>
      axios.post(
        url,
        { organizationId },
        { headers: chatHeaders(), timeout: 120000, validateStatus: () => true }
      ),
    'chat-service purge'
  );
}

async function purgeRemoteAiTaskData(organizationId) {
  const url = `${AI_TASK_SERVICE_URL}/api/ai/tasks/internal/purge-organization/${encodeURIComponent(organizationId)}`;
  await requestWithRetry(
    () => axios.delete(url, { headers: gatewayHeaders(), timeout: 120000, validateStatus: () => true }),
    'ai-task-service purge'
  );
}

async function purgeRemoteRoles(organizationId) {
  const candidates = [
    `${ROLE_PERMISSION_SERVICE_URL}/api/internal/roles/purge-by-server/${encodeURIComponent(organizationId)}`,
    `${ROLE_PERMISSION_SERVICE_URL}/api/roles/internal/purge-by-server/${encodeURIComponent(organizationId)}`,
  ];
  let lastError = null;
  for (const url of candidates) {
    try {
      const res = await requestWithRetry(
        () => axios.post(url, {}, { headers: gatewayHeaders(), timeout: 120000, validateStatus: () => true }),
        'role-permission-service purge'
      );
      if (res.status === 200) {
        return;
      }
      lastError = new Error(`role-permission-service purge: HTTP ${res.status} ${JSON.stringify(res.data)}`);
    } catch (error) {
      lastError = error;
      const status = Number(error?.status || 0);
      if (status === 404) {
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error('role-permission-service purge failed');
}

async function purgeLocalOrganizationRecords(organizationId) {
  const oid = new mongoose.Types.ObjectId(String(organizationId));

  await Team.deleteMany({ organization: oid });
  await Channel.deleteMany({ organization: oid });
  await Department.deleteMany({ organization: oid });
  await Division.deleteMany({ organization: oid });
  await Branch.deleteMany({ organization: oid });
  await Server.deleteMany({ organizationId: oid });
  await JoinApplication.deleteMany({ organization: oid });
  await ChannelAccess.deleteMany({ organization: oid });
  await ChannelRoleAccess.deleteMany({ organization: oid });
  await Membership.deleteMany({ organization: oid });

  const redis = getRedisClient();
  if (redis) {
    await redis.del(`organization:${organizationId}`);
  }

  await Organization.findByIdAndDelete(oid);
}

/**
 * Xóa dữ liệu tổ chức trên mọi service + bản ghi Organization trong DB nội bộ.
 */
async function purgeOrganizationEverywhere(organizationId) {
  if (!mongoose.Types.ObjectId.isValid(String(organizationId))) {
    throw new Error('Invalid organization id');
  }
  if (!GATEWAY_INTERNAL_TOKEN) {
    throw new Error('GATEWAY_INTERNAL_TOKEN is required to purge organization data across services');
  }
  if (!CHAT_INTERNAL_TOKEN) {
    throw new Error('CHAT_INTERNAL_TOKEN is required to purge organization chat messages');
  }
  const oidStr = String(organizationId);

  await Promise.all([
    purgeRemoteTasks(oidStr),
    purgeRemoteDocuments(oidStr),
    purgeRemoteMeetings(oidStr),
    purgeRemoteChatMessages(oidStr),
    purgeRemoteAiTaskData(oidStr),
    purgeRemoteRoles(oidStr),
  ]);

  await purgeLocalOrganizationRecords(oidStr);
  logger.info(`[organizationCascadePurge] completed for ${oidStr}`);
}

module.exports = { purgeOrganizationEverywhere };
