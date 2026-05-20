const path = require('path');

/** Trong Docker `/shared` mount tách khỏi `/app` — require('cors') từ file này không thấy `/app/node_modules`. */
function loadCors() {
  try {
    return require('cors');
  } catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND') throw err;
    const tryPaths = [
      path.join(process.cwd(), 'node_modules', 'cors'),
      path.join('/app', 'node_modules', 'cors'),
    ];
    for (const p of tryPaths) {
      try {
        return require(p);
      } catch (_) {
        /* continue */
      }
    }
    throw err;
  }
}

const cors = loadCors();

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toOriginMatcher(rule) {
  const normalized = String(rule || '').replace(/\/+$/, '').trim();
  if (!normalized) return null;
  if (normalized === '*') return () => true;
  if (!normalized.includes('*')) {
    return (origin) => origin.replace(/\/+$/, '') === normalized;
  }
  const pattern = '^' + escapeRegExp(normalized).replace(/\\\*/g, '.*') + '$';
  const regex = new RegExp(pattern);
  return (origin) => regex.test(origin.replace(/\/+$/, ''));
}

/**
 * CORS đồng bộ với api-gateway: dev phản hồi linh hoạt; production chỉ whitelist CORS_ORIGIN.
 */
function createCorsMiddleware() {
  const isProd = process.env.NODE_ENV === 'production';
  const raw = String(process.env.CORS_ORIGIN || '');
  const allowList = raw
    .split(',')
    .map((o) => o.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim())
    .filter(Boolean);
  const matchers = allowList.map(toOriginMatcher).filter(Boolean);

  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (!isProd) return callback(null, true);
      if (matchers.some((match) => match(origin))) return callback(null, true);
      return callback(new Error('CORS blocked'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
}

module.exports = { createCorsMiddleware };
