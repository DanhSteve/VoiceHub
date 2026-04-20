# VoiceHub

Tài liệu gốc (đồng bộ mã nguồn hiện tại): kiến trúc microservices, **API Gateway** làm cổng REST duy nhất, **client React (Vite)** gọi qua `/api`, realtime **Socket.IO** (namespace `/chat`). Chi tiết đặc tả nghiệp vụ/SRS nằm trong [`docs/spec-pack/`](docs/spec-pack/).

---

## 1. Mục tiêu hệ thống

- Xác thực, hồ sơ người dùng  
- Chat DM / kênh tổ chức, file, thông báo  
- Tổ chức, phòng ban, vai trò (RBAC qua gateway)  
- Task, tài liệu, voice/mediasoup  
- Webhook nội bộ (Python) → notification  
- Realtime Socket.IO (socket-service)

---

## 2. Luồng tổng quát

1. **Client** → `http://localhost:3000/api/...` (API Gateway).  
2. Gateway: **JWT** ([`api-gateway/src/middleware/auth.middleware.js`](api-gateway/src/middleware/auth.middleware.js)) → **RBAC** ([`permission.middleware.js`](api-gateway/src/middleware/permission.middleware.js)) → **proxy** tới service.  
3. Service xử lý nghiệp vụ, MongoDB, Redis (tùy service).  
4. **Socket**: client nối qua gateway (proxy `/socket.io`) hoặc trực tiếp socket-service `:3017` trong dev — xem [`client/src/context/SocketContext.jsx`](client/src/context/SocketContext.jsx) và [`docs/SOCKET_LB.md`](docs/SOCKET_LB.md).

---

## 3. Danh sách service và cổng (theo `docker-compose.core.yml`)

| Thành phần | Port (host) | Ghi chú |
|------------|-------------|---------|
| **api-gateway** | 3000 | REST + proxy `/socket.io` tới socket-service |
| auth-service | 3001 | |
| notification-service | 3003 | |
| user-service | 3004 | Profile REST: [`services/user-service/src/routes/user.routes.js`](services/user-service/src/routes/user.routes.js) |
| voice-service | 3005 (+ UDP 40000–40100) | mediasoup |
| chat-service | 3006 | Messages, channel, socket nội bộ |
| task-service | 3009 | |
| document-service | 3010 | |
| organization-service | 3013 | |
| friend-service | 3014 | |
| role-permission-service | 3015 | |
| **webhook-service** (FastAPI) | 3016 | |
| **socket-service** | 3017 (thường `expose`; truy cập qua gateway hoặc map port khi dev) | Namespace `/chat` |
| **ai-task-service** | 3020 | Hàng đợi / tích hợp AI task (RabbitMQ, v.v.) |
| ai-task-worker | (không map mặc định) | Consumer worker |

Infra: **MongoDB**, **Redis**, **RabbitMQ** (xem [`docs/DOCKER-COMPOSE.md`](docs/DOCKER-COMPOSE.md)).

---

## 4. Công nghệ

| Tầng | Stack |
|------|--------|
| **Frontend** | React 18, Vite 5, React Router 6, Tailwind, Axios, Socket.IO client, mediasoup-client (dynamic import) |
| **Backend** | Node.js + Express (hầu hết), Python FastAPI (webhook) |
| **Dữ liệu** | MongoDB, Redis |
| **Chạy local** | Docker Compose (`docker-compose.yml` + `include` infra/core) |

---

## 5. Cấu trúc thư mục (thực tế)

```
VoiceHub/
  api-gateway/                 # JWT, permission, proxy
  client/                      # React SPA
  services/
    auth-service/
    user-service/
    friend-service/
    organization-service/
    role-permission-service/
    chat-service/
    voice-service/
    task-service/
    document-service/
    notification-service/
    socket-service/
    webhook-service/           # Python
    ai-task-service/
    ai-task-worker/
  shared/                      # Thư viện dùng chung (mongo, logger, …)
  docs/                        # Docker, socket, spec-pack, …
```

Chi tiết cây thư mục: [`STRUCTURE.md`](STRUCTURE.md). Sơ đồ kiến trúc: [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 6. API Gateway → service

| Prefix | Service đích |
|--------|----------------|
| `/api/auth` | auth-service |
| `/api/users` | user-service |
| `/api/friends` | friend-service |
| `/api/organizations`, `/api/servers`, … | organization-service |
| `/api/roles`, `/api/permissions` | role-permission-service |
| `/api/messages`, `/api/chat` | chat-service |
| `/api/voice`, `/api/meetings` | voice-service |
| `/api/tasks`, `/api/work` | task-service |
| `/api/documents` | document-service |
| `/api/notifications` | notification-service |

**Public (không JWT)** — ví dụ: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh-token`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/verify-email`, `/health`. Chi tiết: [`api-gateway/README.md`](api-gateway/README.md).

---

## 7. Frontend (`client/`)

- **Entry**: [`client/src/main.jsx`](client/src/main.jsx) — `BrowserRouter` → **ThemeProvider** → **LocaleProvider** → **AuthProvider** → **SocketProvider** → `App` + toast.  
- **Routes**: [`client/src/App.jsx`](client/src/App.jsx) — `lazy()` + `ProtectedRoute`.  
- **HTTP**:  
  - [`client/src/services/api.js`](client/src/services/api.js) — axios chính (token, toast, landing embed).  
  - [`client/src/services/api/apiClient.js`](client/src/services/api/apiClient.js) — dùng trong `services/api/*API.js`; cùng `baseURL`: `VITE_API_URL || '/api'`.  
- **Quy ước**: [`client/src/services/HTTP_CONVENTIONS.md`](client/src/services/HTTP_CONVENTIONS.md).  
- **User REST**: một nguồn — [`client/src/services/userService.js`](client/src/services/userService.js) (`getMe`, `getProfile`, `PATCH /users/me`, …).  
- **Bundle**: [`client/docs/BUNDLE_NOTES.md`](client/docs/BUNDLE_NOTES.md), script `npm run build:analyze`.

Hướng dẫn cài đặt và cấu trúc UI: [`client/README.md`](client/README.md).

---

## 8. Chạy hệ thống

**Docker (khuyến nghị)** — xem [`docs/DOCKER-COMPOSE.md`](docs/DOCKER-COMPOSE.md):

```bash
docker compose up -d --build
# Dev + hot reload:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

**Frontend riêng** (API đã chạy ở `:3000`):

```bash
cd client && npm install && npm run dev
# Vite: http://localhost:5173 — proxy `/api` và `/socket.io` trong vite.config.js
```

Biến client mẫu: [`client/.env.example`](client/.env.example) (nếu có).

---

## 9. Biến môi trường quan trọng

- `JWT_SECRET` — đồng bộ auth-service, api-gateway, socket-service (verify token).  
- `MONGODB_URI` — mỗi service một DB/collection theo cấu hình.  
- `REDIS_*` — cache / session (tùy service).  
- `WEBHOOK_SECRET` / header webhook — webhook-service.  
- `USER_SERVICE_URL`, `CHAT_SERVICE_URL`, … — URL nội bộ Docker (hostname tên service, không dùng `localhost` trong container).

---

## 10. Mục lục tài liệu trong repo

| Tài liệu | Nội dung |
|----------|----------|
| [`docs/README.md`](docs/README.md) | Hub tài liệu `docs/` |
| [`docs/DOCKER-COMPOSE.md`](docs/DOCKER-COMPOSE.md) | Compose, infra |
| [`docs/SOCKET_LB.md`](docs/SOCKET_LB.md) | Socket / load balancer |
| [`docs/spec-pack/00-INDEX.md`](docs/spec-pack/00-INDEX.md) | Gói đặc tả hệ thống |
| [`MIGRATION.md`](MIGRATION.md) | Ghi chú migration (nếu dùng) |
| [`shared/README.md`](shared/README.md) | Thư viện shared |

---

## 11. Ghi chú đồng bộ tài liệu

- Các file như **STRUCTURE.md / ARCHITECTURE.md / SUMMARY.md** trước đây mô tả *chat-system-service*, *work-management-service*, cổng 400x — **không còn khớp** repo; đã thay bằng bản cập nhật cùng commit này.  
- README repo cũ (phiên bản dài với bảng port 4000–4005) đã được **thay thế** để tránh mâu thuẫn với gateway **3000** và compose hiện tại.

---

## License

Xem file [LICENSE](LICENSE) nếu có trong repo.
