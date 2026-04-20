const messageService = require('../services/message.service');

const DEFAULT_INTERVAL_MS = Math.max(
  60_000,
  parseInt(process.env.STORAGE_GC_INTERVAL_MS || String(60 * 60 * 1000), 10) || 60 * 60 * 1000
);

function startStorageGcScheduler() {
  if (process.env.STORAGE_GC_ENABLED === 'false') {
    console.log('[chat-service] Storage GC scheduler disabled');
    return;
  }

  const tick = async () => {
    try {
      const r = await messageService.runStorageGcOnce();
      if (r.deleted > 0 || process.env.STORAGE_GC_LOG_EMPTY === 'true') {
        console.log('[chat-service] Storage GC', r);
      }
    } catch (e) {
      console.error('[chat-service] Storage GC error', e.message);
    }
  };

  setInterval(tick, DEFAULT_INTERVAL_MS);
  setTimeout(tick, 15_000);
}

module.exports = { startStorageGcScheduler };
