# API Gateway

API Gateway là entry point duy nhất cho tất cả các microservices trong hệ thống.

## Chức năng

1. **JWT Authentication**: Verify JWT token từ client và gắn `req.user`
2. **Request Routing**: Route requests đến microservice phù hợp
3. **Request Proxy**: Forward requests với user context
4. **BFF read layer** (`src/bff/`): Gom cross-service reads, Redis cache ngắn, request coalescing. Xem [docs/gateway-bff-architecture.md](../docs/gateway-bff-architecture.md).
   - `GET /api/bootstrap` — user + orgs + badges
   - `GET /api/dashboard/summary` — dashboard aggregate
   - `GET /api/organizations/:orgId/shell` — cache wrap org shell (wave 2a)
   - `GET /api/organizations/:orgId/documents-overview` — cache wrap (logic vẫn ở org-service)

## Flow

```
Client
  └── Authorization: Bearer <JWT>
        ↓
API Gateway
  1. Verify JWT (auth.middleware.js)
  2. Gắn req.user
  3. Kiểm tra quyền truy cập (permission.middleware.js)
     - Gọi Role Service: userId, serverId, action
     - Role Service trả về: allow / deny
  4. allow → Forward request
     deny → 403 Forbidden
        ↓
Microservice (Chat, Task, ...)
  - Nhận request với user context
```

## Phân công trách nhiệm

| Thành phần | Trách nhiệm |
|------------|-------------|
| **Auth Service** | Xác thực (JWT, userId) |
| **API Gateway** | Verify JWT + kiểm tra quyền truy cập |
| **Role Service** | Quản lý role & permission theo server |
| **Business Service** | Chỉ xử lý nghiệp vụ |

👉 Gateway không tự tính role, chỉ hỏi Role Service.

## Cấu hình môi trường

Tạo file `.env` trực tiếp trong thư mục `api-gateway/` và cập nhật các giá trị:

```env
# Server
NODE_ENV=development
PORT=3000

# JWT Secret (phải giống với auth-service)
JWT_SECRET=your-secret-key-change-in-production

# Microservices URLs
AUTH_SERVICE_URL=http://auth-service:3001
USER_SERVICE_URL=http://user-service:3004
# ... các service khác
SOCKET_SERVICE_URL=http://socket-service:3017
```

## Routes

### Public Routes (không cần authentication)
- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/refresh-token`
- `/api/auth/forgot-password`
- `/api/auth/reset-password`
- `/api/auth/verify-email`
- `/health`

### Protected Routes (cần JWT token)
Tất cả các routes khác đều cần JWT token trong header:
```
Authorization: Bearer <token>
```

## Service Routing

- `/api/auth/*` → Auth Service (public routes)
- `/api/users/*` → User Service
- `/api/friends/*` → Friend Service (không cần serverId)
- `/api/organizations/*` → Organization Service
- `/api/roles/*`, `/api/permissions/*` → Role & Permission Service
- `/api/messages/*`, `/api/chat/*` → Chat Service (cần serverId)
- `/api/voice/*`, `/api/meetings/*` → Voice Service (cần serverId)
- `/api/tasks/*`, `/api/work/*` → Task Service (cần serverId)
- `/api/documents/*` → Document Service (cần serverId)
- `/api/notifications/*` → Notification Service
- `/socket.io/*` (HTTP polling + WS upgrade) → Socket Service (realtime qua gateway)

## Socket Realtime qua Gateway

Client chỉ cần kết nối `http://localhost:3000` cho Socket.IO (namespace `/chat`).
Gateway sẽ proxy đến `socket-service` nội bộ `http://socket-service:3017`.

Ví dụ client:

```js
io('http://localhost:3000/chat', {
  auth: { token: '<jwt>' },
  transports: ['websocket', 'polling'],
});
```

## Permission Check

API Gateway tự động kiểm tra quyền truy cập cho các routes cần serverId:

### Actions được map:
- `chat:read`, `chat:write`, `chat:delete`
- `task:read`, `task:write`, `task:delete`
- `document:read`, `document:write`, `document:delete`
- `voice:read`, `voice:write`
- `organization:read`, `organization:write`, `organization:delete`
- `server:read`, `server:write`, `server:delete`

### ServerId được extract từ:
1. Query params: `?serverId=xxx` hoặc `?organizationId=xxx`
2. Route params: `/api/servers/:serverId`
3. Request body: `{ serverId: "xxx" }`
4. Headers: `X-Server-Id` hoặc `X-Organization-Id`

## Chạy service

```bash
# Development
npm run dev

# Production
npm start
```

## Testing

```bash
# Health check
curl http://localhost:3000/health

# Test với JWT token
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/messages
```


