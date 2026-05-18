require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { connectDB, connectRedis, disconnectDB, logger } = require('/shared');
const roomManager = require('./sfu/roomManager');
const registerVoiceNamespace = require('./socket/voice.namespace');

const PORT = process.env.PORT || 3005;
const VOICE_SIGNAL_PATH = process.env.VOICE_SIGNAL_PATH || '/voice-socket';
const DEPENDENCY_RETRY_MS = Math.max(2000, Number(process.env.VOICE_DEPENDENCY_RETRY_MS || 5000));

const server = http.createServer(app);
const isProd = process.env.NODE_ENV === 'production';
const corsList = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((item) => item.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim())
  .filter(Boolean);
const voiceSocketCors =
  // Dev: cho phép mọi origin để client chạy qua IP LAN vẫn kết nối được.
  // Production: chỉ whitelist theo CORS_ORIGIN (giữ behavior hiện tại).
  !isProd
    ? true
    : corsList.length === 0
      ? false
      : corsList.length === 1
        ? corsList[0]
        : corsList;

const io = new Server(server, {
  cors: {
    origin: voiceSocketCors,
    credentials: true,
  },
  path: VOICE_SIGNAL_PATH,
  transports: ['websocket', 'polling'],
});

registerVoiceNamespace(io);

let dependencyInitInFlight = false;
let mongoReady = false;
let redisReady = false;
let roomManagerReady = false;

const initDependencies = async () => {
  if ((mongoReady && redisReady && roomManagerReady) || dependencyInitInFlight) return;
  dependencyInitInFlight = true;
  try {
    if (!mongoReady) {
      await connectDB(null, { exitOnFailure: false });
      mongoReady = true;
    }

    if (!redisReady) {
      connectRedis();
      redisReady = true;
    }

    if (!roomManagerReady) {
      await roomManager.init();
      roomManagerReady = true;
    }

    logger.info('Voice dependencies are ready');
  } catch (error) {
    logger.error(
      `Voice dependencies init failed, retrying in ${DEPENDENCY_RETRY_MS}ms: ${error?.message || error}`
    );
    setTimeout(() => {
      dependencyInitInFlight = false;
      initDependencies();
    }, DEPENDENCY_RETRY_MS);
    return;
  }
  dependencyInitInFlight = false;
};

// Khởi động server HTTP + WS trước, dependency sẽ retry nền để tránh Gateway gặp ECONNREFUSED.
server.listen(PORT, () => {
  logger.info(`Voice Service đang chạy trên cổng ${PORT}`);
  logger.info(`Voice signaling path: ${VOICE_SIGNAL_PATH}, namespace: /voice`);
  initDependencies();
});

process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  await disconnectDB();
  server.close(() => process.exit(0));
});

