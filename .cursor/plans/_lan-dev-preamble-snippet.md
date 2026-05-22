<!-- Snippet chuẩn — chèn vào mọi plan wave-1b … wave-3d (không dùng làm plan độc lập) -->

## Tiền đề — Dev `https://voicehub.local`

**URL dev chuẩn:** `https://voicehub.local/` (không thay bằng `localhost:5173` / `IP:3000` khi kiểm thử tính năng plan).

Tài liệu: [voicehub-constraints.mdc](../rules/voicehub-constraints.mdc) mục **Dev LAN**, [docs/lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md), Nginx [devops/nginx/dev-https.conf](../../devops/nginx/dev-https.conf).

### Checklist trước khi code / merge

1. **`client/.env`**
   - `VITE_API_URL=/api`
   - `VITE_SOCKET_USE_GATEWAY=true`; `VITE_SOCKET_URL` trống (HTTPS → `window.location.origin`)
   - `VITE_HMR_HOST=voicehub.local`, `VITE_HMR_PROTOCOL=wss`, `VITE_HMR_CLIENT_PORT=443`
   - `VITE_ALLOWED_HOSTS` có `voicehub.local`

2. **Client runtime**
   - Không hardcode `http://localhost:*`, `127.0.0.1`, IP LAN trong `axios`/`fetch`/socket/media.
   - Media/avatar: `resolveMediaUrl()` (path `/uploads/...` same-origin).
   - `FormData`: không gửi `Content-Type: application/json` (đã xử lý trong `api.js`).

3. **Gateway + Nginx**
   - Mọi API browser: `/api/...` qua Nginx → gateway.
   - `/uploads/...`: Nginx → gateway → user-service; gateway **bắt buộc** `pathRewrite` `/uploads` (tránh 404 avatar).
   - Route/file tĩnh mới: thêm proxy Nginx + gateway trước khi FE trỏ URL tuyệt đối.

4. **Service `.env` (khi đụng auth/email/CORS/upload)**
   - `auth-service`: `FRONTEND_URL=https://voicehub.local`
   - `api-gateway`: `CORS_ORIGIN` có `https://voicehub.local`
   - Gọi S2S: hostname Docker (`http://*-service:port`), không IP WiFi của máy client.

5. **Verify**
   - `powershell -File devops/nginx/verify-lan-https.ps1 -BaseUrl https://voicehub.local`
   - Một máy LAN khác (file `hosts` → IP máy dev): mở cùng URL, thử luồng vừa sửa.

### Phải / Không (tóm tắt)

| Phải | Không |
|------|--------|
| API browser relative `/api` | baseURL `http://localhost:3000` hoặc `http://<IP-LAN>:3000` |
| Socket/voice: gateway + `window.location.origin` khi `https:` | Socket cố định port máy dev trên máy LAN |
| HMR qua Nginx (`voicehub.local`, `wss`, `443`) | HMR `localhost:5173` khi user mở `https://voicehub.local` |
| Link redirect/email: `Origin` / `FRONTEND_URL` hostname | URL tuyệt đối gắn IP LAN trong payload API |
| Gateway BFF/bootstrap: client `/api/...`; server gọi Docker nội bộ | Đổi URL downstream vì browser đổi IP |
