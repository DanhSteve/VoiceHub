# Shared Utilities

Thư viện dùng chung cho tất cả các microservices Node trong repo VoiceHub. Tổng quan repo: [`../README.md`](../README.md).

## Cấu trúc

```
shared/
├── config/
│   ├── mongo.js      # MongoDB connection
│   ├── redis.js      # Redis connection
│   └── env.js        # Environment variables loader
├── middleware/
│   └── auth.js       # JWT authentication middleware
└── utils/
    ├── logger.js       # Logger utility (redact token/phone/content trong object log)
    ├── fieldCrypto.js  # AES-256-GCM envelope: encryptField / decryptField / phoneBlindIndex
    ├── cryptoMetrics.js
    ├── migration.js    # unwrapPlaintext, lazyEncryptField
    └── realtime.js
```

## Mã hóa trường dữ liệu (at-rest)

- Đặt `ENCRYPTION_MASTER_KEY` (32+ ký tự UTF-8 hoặc 64 ký tự hex) trên **user-service**, **chat-service**, **notification-service** (và bất kỳ service nào gọi `encryptField`).
- Lazy migration: đọc vẫn trả plaintext; bản ghi cũ được mã hóa lại khi đọc/ghi hoặc qua `scripts/encryption-backfill.js`.
- Metrics: `getCryptoMetrics()` — endpoint `/health/crypto` trên user-service (ví dụ).

## Cách sử dụng

### 1. Cài đặt dependencies

Trong mỗi service, cài đặt dependencies:
```bash
npm install dotenv ioredis jsonwebtoken mongoose
```

### 2. Import và sử dụng

#### MongoDB Connection
```javascript
const { connectDB } = require('../../shared/config/mongo');

// Kết nối MongoDB
await connectDB();
```

#### Redis Connection
```javascript
const { connectRedis, getRedisClient } = require('../../shared/config/redis');

// Kết nối Redis
connectRedis();

// Sử dụng Redis client
const redis = getRedisClient();
await redis.set('key', 'value');
```

#### Environment Variables
```javascript
const env = require('../../shared/config/env');

// Validate required variables
env
  .require(['MONGODB_URI', 'JWT_SECRET'])
  .validate();

// Lấy giá trị
const port = env.getNumber('PORT', 3000);
const isDev = env.getBoolean('NODE_ENV', 'development') === 'development';
```

#### Authentication Middleware
```javascript
const { authenticate, socketAuth } = require('../../shared/middleware/auth');

// HTTP middleware
app.use('/api/protected', authenticate);

// Socket.IO middleware
io.use(socketAuth);
```

#### Logger
```javascript
const logger = require('../../shared/utils/logger');

logger.info('Service started');
logger.error('Error occurred', error);
logger.warn('Warning message');
logger.debug('Debug information');
```

## Environment Variables

### LOG_LEVEL
- `error` - Chỉ log errors
- `warn` - Log warnings và errors
- `info` - Log info, warnings và errors (mặc định)
- `debug` - Log tất cả

## Lưu ý

1. **Đường dẫn**: Điều chỉnh đường dẫn `../../shared/` tùy theo cấu trúc thư mục của service
2. **Dependencies**: Đảm bảo tất cả dependencies đã được cài đặt
3. **Environment**: Load `.env` file trước khi sử dụng shared config



