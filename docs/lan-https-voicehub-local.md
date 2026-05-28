# Truy cập LAN qua `https://voicehub.local`

Hướng dẫn đồng bộ với `devops/nginx/dev-https.conf`, `client/.env` (HMR), và `client/src/context/SocketContext.jsx`.

## Kiến trúc (máy dev làm host)

```text
[Máy client LAN]
  hosts: <IP-dev> voicehub.local
  trình duyệt → https://voicehub.local:443
        ↓
[Nginx trên máy dev — listen 443]
  /        → 127.0.0.1:5173 (Vite, host 0.0.0.0)
  /api/    → 127.0.0.1:3000 (API Gateway)
  /socket.io/   → gateway → socket-service
  /voice-socket/ → gateway → voice signaling
```

Client **không** mở trực tiếp `:5173` hay `:3000` từ LAN (trừ khi debug). Mọi thứ đi qua HTTPS Nginx.

## Điều kiện trên máy dev (host)

| Thành phần | Cổng | Ghi chú |
|------------|------|---------|
| Vite | 5173 | `VITE_HOST=0.0.0.0` trong `client/.env` |
| API Gateway | 3000 | Docker hoặc `node` local |
| Nginx HTTPS | 443 | `devops/nginx/dev-https.conf` |
| Stack microservice | nội bộ Docker | Không đổi URL service-to-service |

**Chạy trên host:**

1. Stack VoiceHub (gateway + services + `npm run dev` trong `client/`).
2. Cert mkcert: `devops/nginx/mkcert-setup.ps1` (tên file trong `dev-https.conf` phải khớp `certs/`).
3. Nginx: `nginx -p D:/VoiceHub/devops/nginx -c dev-https.conf` (đường dẫn tùy máy).
4. **Windows Firewall:** cho phép inbound **TCP 443** (Private network) — nếu không, máy LAN không vào được dù `hosts` đúng.

## `client/.env` — ý nghĩa cho LAN

```env
VITE_API_URL=/api
VITE_SOCKET_USE_GATEWAY=true
VITE_ALLOWED_HOSTS=voicehub.local,...,<IP-LAN-dev>
VITE_HMR_HOST=voicehub.local
VITE_HMR_PROTOCOL=wss
VITE_HMR_CLIENT_PORT=443
```

- **`VITE_API_URL=/api`:** request cùng origin `https://voicehub.local/api` → Nginx → gateway (không lệ thuộc IP đổi).
- **`VITE_SOCKET_USE_GATEWAY=true`:** socket/voice dùng `window.location.origin` khi HTTPS (`SocketContext.jsx`) → `wss` qua Nginx, không gọi `https://voicehub.local:3000`.
- **`VITE_HMR_*`:** chỉ cho hot-reload dev; client vẫn mở `https://voicehub.local`, HMR nối `wss://voicehub.local:443`.
- **`VITE_ALLOWED_HOSTS`:** bắt buộc có `voicehub.local`; thêm IP LAN chỉ khi ai đó mở thẳng `http://<IP>:5173` (không khuyến nghị qua LAN).

Sau khi sửa `.env`, **restart Vite**.

## Mỗi máy client trong LAN

### 1. File `hosts` (bắt buộc)

`C:\Windows\System32\drivers\etc\hosts` (quyền Administrator):

```text
<IP-IPv4-của-máy-dev> voicehub.local
```

Lấy IP trên dev: `ipconfig` → adapter WiFi → IPv4. Hoặc chạy:

```powershell
powershell -ExecutionPolicy Bypass -File D:\VoiceHub\devops\nginx\print-lan-hosts-hint.ps1
```

**IP WiFi đổi theo DHCP?** — Có thể đổi sau reboot router. Cách ổn định:

- Router: **DHCP reservation** (gán IP cố định theo MAC máy dev), hoặc
- Windows: static IPv4 trên adapter WiFi.

Khi IP dev đổi → sửa **một dòng IP** trong `hosts` trên **từng máy client** (hostname `voicehub.local` giữ nguyên).

### 2. Tin chứng chỉ HTTPS (mkcert)

Trình duyệt trên client phải tin CA của mkcert:

- Trên **máy dev** đã chạy `mkcert -install`.
- Trên **máy client:** cài cùng root CA:
  - Trên dev: `mkcert -CAROOT` → copy `rootCA.pem` sang client.
  - Client: import vào **Trusted Root Certification Authorities** (Windows), hoặc chạy `mkcert -install` sau khi copy CA.

Không tin CA → cảnh báo HTTPS, mic/camera WebRTC có thể bị chặn.

### 3. Mở app

Chỉ dùng: **`https://voicehub.local`** (không `http://`).

## Kiểm tra nhanh

**Trên máy dev** (sau khi thêm `127.0.0.1 voicehub.local` hoặc IP dev vào hosts):

```powershell
cd D:\VoiceHub
powershell -ExecutionPolicy Bypass -File .\devops\nginx\verify-lan-https.ps1 -BaseUrl "https://voicehub.local"
```

**Trên máy client:** cùng lệnh sau khi đã sửa `hosts` + tin CA.

Kỳ vọng: Frontend 200, `/api/health/gateway-trust` 200, `/socket.io` và `/voice-socket` polling có `sid`.

## Checklist lỗi thường gặp

| Triệu chứng | Nguyên nhân thường gặp |
|-------------|-------------------------|
| Không resolve `voicehub.local` | Thiếu / sai dòng `hosts` trên máy đó |
| Connection refused :443 | Nginx chưa chạy hoặc firewall chặn 443 |
| HTTPS không tin cậy | Client chưa cài mkcert root CA |
| Trang trắng / Vite blocked host | Thiếu `voicehub.local` trong `VITE_ALLOWED_HOSTS` |
| API 401/403 | Token/login; org membership (xem organization-service) |
| Socket không kết nối | Gateway/socket-service down; kiểm tra console `🔌 [Socket]` — base URL phải là `https://voicehub.local` |
| Upload file lỗi CORS | Firebase bucket cần origin `https://voicehub.local` (`docs/firebase-storage-cors.json`) |
| HMR/WebSocket failed | `VITE_HMR_*` phải khớp HTTPS 443; mở đúng `https://voicehub.local` |
| Đăng ký OK nhưng không có email / link `localhost` | `services/auth-service/.env`: `FRONTEND_URL=https://voicehub.local`, `EMAIL_USER` + `EMAIL_PASSWORD` (App Password Gmail, không khoảng trắng). Mở app bằng `https://voicehub.local` khi đăng ký. |
| Xác thực email 401 / không mở được | Link phải là `https://voicehub.local/verify-email?token=...`; máy đó cần `hosts` + tin mkcert. Gateway public route `/api/auth/verify-email`. |
| Resend verification 401 | Gateway phải có `/api/auth/resend-verification` trong public routes (`api-gateway/src/config/services.js`). |
| `GET /api/users/me` 404 (client LAN, socket OK) | Thường **không** phải Gateway chết — request đã tới user-service nhưng chưa có UserProfile (bootstrap verify email lỗi trước đây). Sửa `user-service` + đăng nhập lại; kiểm tra `USER_SERVICE_INTERNAL_TOKEN` đồng bộ. |
| Client LAN dùng `127.0.0.1 voicehub.local` | Trên máy **không phải host dev** phải trỏ `hosts` → **IP WiFi máy dev**, không `127.0.0.1`. |
| Menu trái không bấm được (máy touch / LAN) | Sidebar cũ thu còn 8px + cần hover chuột; đã sửa rail tối thiểu 56px + mở sẵn trên thiết bị không hover. Hard refresh (`Ctrl+F5`) trên client. |

## Không cần chỉnh khi IP đổi (nếu dùng đúng URL)

- `VITE_HMR_HOST`, `VITE_HMR_PROTOCOL`, `VITE_HMR_CLIENT_PORT`
- `VITE_API_URL=/api`
- `VITE_SOCKET_USE_GATEWAY=true`

**Cần chỉnh:** `hosts` trên client (+ tùy chọn IP trong `VITE_ALLOWED_HOSTS` nếu truy cập thẳng `:5173`).

## Tham chiếu code

- Nginx: `devops/nginx/dev-https.conf`
- Origin helper: `client/src/utils/browserOrigin.js` (`resolveApiBaseUrl`, `resolveAppOrigin`)
- Socket HTTPS: `client/src/context/SocketContext.jsx` (`getAutoGatewayBaseUrl`)
- API relative: `client/src/services/api.js`, `client/src/services/api/apiClient.js`
- Voice signaling: `FriendCallMediaModal.jsx`, `VoiceRoomPage.jsx`, `OrganizationVoiceChannelView.jsx`
- Invite/email URL: `shared/utils/resolveFrontendUrl.js` (Origin, Referer, `X-Forwarded-*`)
