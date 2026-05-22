const axios = require('axios');
const { services } = require('../config/services');

const DEFAULT_TIMEOUT_MS = Math.min(
  8000,
  Math.max(3000, parseInt(process.env.BFF_DOWNSTREAM_TIMEOUT_MS || '7000', 10) || 7000)
);

function buildTrustedHeaders(userId, userEmail) {
  const headers = { 'Content-Type': 'application/json' };
  const token = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (token) headers['x-gateway-internal-token'] = token;
  if (userId != null && userId !== '') headers['x-user-id'] = String(userId).trim();
  if (userEmail) headers['x-user-email'] = String(userEmail).trim();
  return headers;
}

async function fetchJson(url, headers, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  try {
    const response = await axios.get(url, { headers, timeout: timeoutMs });
    return { ok: true, status: response.status, data: response.data };
  } catch (error) {
    const status = error.response?.status;
    console.warn(`[bff] ${label} failed:`, status || error.code || error.message);
    return { ok: false, status, data: error.response?.data, error };
  }
}

function unwrapPayload(body) {
  if (body == null) return null;
  if (body.data !== undefined && (body.success === true || body.status === 'success')) {
    return body.data;
  }
  if (body.data !== undefined) return body.data;
  return body;
}

module.exports = {
  services,
  buildTrustedHeaders,
  fetchJson,
  unwrapPayload,
  DEFAULT_TIMEOUT_MS,
};
