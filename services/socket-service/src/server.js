require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { socketAuth } = require('/shared/middleware/auth');
const { connectRedis, disconnectRedis } = require('/shared');
const registerChatNamespace = require('./socket/chat.namespace');
const { setChatNamespace, publishRealtimeEvent } = require('./socket/realtimeHub');

const app = express();
app.use(express.json({ limit: '1mb' }));

const INTERNAL_REALTIME_TOKEN = process.env.REALTIME_INTERNAL_TOKEN || '';

const isProd = process.env.NODE_ENV === 'production';
// Dev: luôn cho phép mọi origin để FE truy cập được qua IP LAN và port bất kỳ.
// Production: chỉ whitelist theo CORS_ORIGIN.
const corsOriginRaw = String(process.env.CORS_ORIGIN || '').trim();
const corsOrigin = corsOriginRaw || (isProd ? '' : '');
const parsedOrigins = corsOrigin
  .split(',')
  .map((origin) => origin.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim())
  .filter(Boolean);

const socketCorsOrigin = !isProd
  ? true
  : parsedOrigins.length === 0
    ? false
    : parsedOrigins.length === 1
      ? parsedOrigins[0]
      : parsedOrigins;

app.use(
  cors({
    origin: socketCorsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  })
);
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'socket-service' });
});

app.post('/internal/realtime/publish', (req, res) => {
  const token = req.headers['x-realtime-token'];
  const expected = String(INTERNAL_REALTIME_TOKEN || '').trim();
  if (!expected) {
    return res.status(503).json({ ok: false, message: 'REALTIME_INTERNAL_TOKEN not configured' });
  }
  if (token !== expected) {
    return res.status(401).json({ ok: false, message: 'Unauthorized realtime publish' });
  }

  const result = publishRealtimeEvent(req.body || {});
  if (!result.ok) {
    return res.status(400).json(result);
  }
  return res.json(result);
});

const PORT = process.env.PORT || 3017;
const SOCKET_PING_INTERVAL_MS = Math.max(10000, Number(process.env.SOCKET_PING_INTERVAL_MS || 25000));
const SOCKET_PING_TIMEOUT_MS = Math.max(20000, Number(process.env.SOCKET_PING_TIMEOUT_MS || 60000));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: socketCorsOrigin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingInterval: SOCKET_PING_INTERVAL_MS,
  pingTimeout: SOCKET_PING_TIMEOUT_MS,
});

async function attachRedisAdapterIfEnabled() {
  if (process.env.SOCKET_IO_REDIS_ADAPTER === 'false') return;
  const url =
    process.env.REDIS_URL ||
    (process.env.REDIS_HOST
      ? `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`
      : null);
  if (!url) return;

  try {
    const { createClient } = require('redis');
    const { createAdapter } = require('@socket.io/redis-adapter');
    const pubClient = createClient({ url });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[socket-service] Socket.IO Redis adapter enabled');
  } catch (err) {
    console.warn('[socket-service] Redis adapter not available:', err.message);
  }
}

function startListen() {
  server.listen(PORT, () => {
    const originLabel =
      socketCorsOrigin === true
        ? '*'
        : Array.isArray(socketCorsOrigin)
          ? socketCorsOrigin.join(', ')
          : String(socketCorsOrigin);
    console.log(`Socket Service đang chạy trên cổng ${PORT}`);
    console.log(`[socket-service] Allowed origins: ${originLabel}`);
    console.log(
      `[socket-service] pingInterval=${SOCKET_PING_INTERVAL_MS}ms pingTimeout=${SOCKET_PING_TIMEOUT_MS}ms offlineGrace=${Math.max(0, Number(process.env.PRESENCE_OFFLINE_GRACE_MS || 12000))}ms`
    );
    const presenceToken = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
    console.log(
      `[socket-service] Presence → user-service: USER_SERVICE_URL=${process.env.USER_SERVICE_URL || 'http://user-service:3004'} ` +
        `internal token ${presenceToken ? 'SET (len=' + presenceToken.length + ')' : 'MISSING (disconnect sẽ KHÔNG cập nhật offline trong DB)'}`
    );
  });
}

(async () => {
  try {
    connectRedis();
  } catch (e) {
    console.warn('[socket-service] Redis optional:', e.message);
  }

  await attachRedisAdapterIfEnabled();

  const chatNamespace = io.of('/chat');
  chatNamespace.use(socketAuth);
  setChatNamespace(chatNamespace);
  registerChatNamespace(chatNamespace);

  startListen();

  process.on('SIGTERM', () => {
    console.log('[socket-service] SIGTERM: closing Socket.IO and HTTP');
    io.close(() => {
      server.close(async () => {
        try {
          await disconnectRedis();
        } catch (e) {
          /* ignore */
        }
        process.exit(0);
      });
    });
  });
})();
