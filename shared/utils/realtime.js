const axios = require('axios');
const logger = require('./logger');

const SOCKET_SERVICE_URL = process.env.SOCKET_SERVICE_URL || 'http://socket-service:3017';
const INTERNAL_REALTIME_TOKEN = process.env.REALTIME_INTERNAL_TOKEN || '';

async function emitRealtimeEvent(event = {}, options = {}) {
  const {
    timeoutMs = 3000,
  } = options;

  if (!event || !event.event) {
    return { ok: false, reason: 'missing_event_name' };
  }

  const token = String(INTERNAL_REALTIME_TOKEN || '').trim();
  if (!token) {
    logger.warn('[realtime] REALTIME_INTERNAL_TOKEN not set; skip emit');
    return { ok: false, reason: 'missing_realtime_token' };
  }

  try {
    const headers = { 'x-realtime-token': token };

    const response = await axios.post(
      `${SOCKET_SERVICE_URL}/internal/realtime/publish`,
      event,
      {
        timeout: timeoutMs,
        headers,
      }
    );
    const data = response?.data || {};
    return { ok: true, data };
  } catch (error) {
    logger.warn(
      `[realtime] emit failed: ${event.event} -> ${error.response?.status || ''} ${error.message}`
    );
    return {
      ok: false,
      reason: error.response?.data?.message || error.message,
      status: error.response?.status || null,
    };
  }
}

module.exports = {
  emitRealtimeEvent,
};
