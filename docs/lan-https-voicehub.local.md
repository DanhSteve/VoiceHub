# Dev LAN — `https://voicehub.local`

Môi trường dev chuẩn: trình duyệt (máy dev + máy trong WiFi) mở **`https://voicehub.local`**, không mở trực tiếp `http://localhost:3000` hay `http://<IP-LAN>:5173` cho luồng app chính.

IP WiFi đổi theo DHCP → chỉ sửa file **hosts** trên máy client (`<IP-máy-dev> voicehub.local`), **không** hardcode IP trong code FE.

## Chuỗi proxy

```text
Browser → Nginx :443 (TLS) → Vite :5173 (/) | Gateway :3000 (/api, /uploads, /socket.io, …)
Gateway → Docker services (http://*-service:port)
```

Cấu hình Nginx: `devops/nginx/dev-https.conf`. Cert: `devops/nginx/mkcert-setup.ps1`.

## `client/.env` (bắt buộc khi implement plan wave-1b+)

| Biến | Giá trị dev LAN |
|------|------------------|
| `VITE_API_URL` | `/api` (same-origin, không `http://localhost:3000`) |
| `VITE_SOCKET_USE_GATEWAY` | `true` |
| `VITE_SOCKET_URL` | để trống — HTTPS dùng `window.location.origin` |
| `VITE_HMR_HOST` | `voicehub.local` |
| `VITE_HMR_PROTOCOL` | `wss` |
| `VITE_HMR_CLIENT_PORT` | `443` |
| `VITE_ALLOWED_HOSTS` | có `voicehub.local` (+ IP phụ trợ mở thẳng `:5173` nếu cần) |

## Backend / gateway (không đổi vì browser đổi IP)

- `api-gateway/.env`: `CORS_ORIGIN` gồm `https://voicehub.local` (và origin cần thiết).
- `services/auth-service/.env`: `FRONTEND_URL=https://voicehub.local` (email verify, redirect).
- Gọi nội bộ gateway → service: `http://user-service:3004`, … (Docker), không URL LAN của browser.

## Client code — tránh lỗi thường gặp

| Việc | Đúng | Sai |
|------|------|-----|
| REST | `api.get('/users/me')` qua `resolveApiBaseUrl()` → `/api` | `axios` baseURL `http://127.0.0.1:3000` |
| Socket | `SocketContext`: `https:` → `window.location.origin` | Cố định `:3000` / `:3017` trên máy LAN |
| Avatar / media | `resolveMediaUrl('/uploads/...')` → `https://voicehub.local/uploads/...` | URL tuyệt đối localhost hoặc IP |
| Upload FormData | Interceptor xóa `Content-Type` mặc định (`api.js`) | Để `application/json` khi POST file |
| Link email / mời | `X-Frontend-Url` / `FRONTEND_URL` | IP LAN trong payload |

## Gateway — static `/uploads`

Avatar lưu tại user-service, browser tải qua **`GET https://voicehub.local/uploads/...`**.

- Nginx: `location /uploads/` → gateway.
- Gateway: proxy tới user-service với **`pathRewrite`** (Express mount `/uploads` strip prefix — nếu thiếu sẽ 404 dù file tồn tại).

## Friend — tìm theo SĐT (`GET /api/friends/search`)

- Gateway proxy path dùng `originalUrl` (tránh 404 “Service not found” khi `req.path` lệch).
- `friend-service`: tin `x-user-id` + `x-gateway-internal-token` từ gateway; `USER_SERVICE_INTERNAL_TOKEN` trùng `user-service`.
- `user-service`: tra cứu SĐT qua `phoneBlindIndex` khi PII mã hóa (`ENCRYPTION_MASTER_KEY`).

## Kiểm thử tối thiểu (trước merge plan 1b+)

```powershell
powershell -File devops/nginx/verify-lan-https.ps1 -BaseUrl https://voicehub.local
```

**Wave 1B — shell API phải HTTP 200:**

```bash
# Đăng nhập thật
TEST_EMAIL=you@example.com TEST_PASSWORD=secret node devops/scripts/test-bootstrap-api.js

# Hoặc dev (userId có profile trong DB)
TEST_USER_ID=<mongo-userId> node devops/scripts/test-bootstrap-api.js
```

Script kiểm tra: `auth/me`, `bootstrap`, `users/me`, `organizations/my`, `notifications`, `friends/pending`.

- Máy dev: đăng nhập, sidebar, upload avatar, một API `GET /api/users/me` = 200.
- Một máy khác trong LAN: cùng URL (đã sửa `hosts`), click menu, không lỗi CORS/socket.

## Tham chiếu plan

Mọi plan từ [wave-1b](../.cursor/plans/wave-1b-bootstrap-gateway.plan.md) gồm section **Tiền đề — Dev `https://voicehub.local`** và snippet [_lan-dev-preamble-snippet.md](../.cursor/plans/_lan-dev-preamble-snippet.md).
