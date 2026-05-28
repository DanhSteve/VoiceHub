# Hiệu năng load ban đầu — `https://voicehub.local`

## Triệu chứng

Mở trang chủ / dashboard cảm giác chờ lâu trước khi UI sẵn sàng (đặc biệt khi đã đăng nhập, còn token trong localStorage).

## Nguyên nhân chính (đã xử lý)

### 1. Request trùng khi khôi phục phiên

Trước đây `AuthContext` khi reload:

1. `GET /api/auth/me` (auth-service)
2. `GET /api/users/me` (user-service) — **tuần tự** sau bước 1
3. `GET /api/bootstrap` (BFF) — lại gọi `users/me` + `organizations/my` + notifications + friends/pending

→ ~6 hop gateway/microservice cho một lần mở app.

**Sửa:** `restoreAuthSession()` chỉ gọi **một** `GET /api/bootstrap` (BFF cache + coalesce). Chỉ fallback `getCurrentUser` khi bootstrap lỗi. `getCurrentUser` fallback dùng `Promise.allSettled` song song `auth/me` + `users/me`.

### 2. React StrictMode (dev)

Effect mount 2 lần → bootstrap gọi đôi. **Sửa:** dedupe in-flight trong `fetchBootstrap()` và `restoreAuthSession()`.

### 3. Các yếu tố còn lại (không đổi code)

| Yếu tố | Ghi chú |
|--------|---------|
| Vite dev qua Nginx | Lần đầu tải nhiều chunk JS — bình thường; production build nhẹ hơn |
| `ProtectedRoute` | Chờ `loading` auth xong mới render — cần thiết, đã rút ngắn thời gian auth |
| Cold BFF cache | Lần đầu sau restart gateway vẫn gọi 4 service; lần sau `X-Bff-Cache: HIT` |
| Socket connect | Song song, không chặn auth |

## Kiểm tra sau sửa

1. DevTools → Network: sau reload chỉ **một** `/api/bootstrap` (không còn chuỗi auth/me → users/me → bootstrap).
2. Reload lần 2 trong 45s: response bootstrap có header `X-Bff-Cache: HIT`.
3. Guest (không token): không gọi bootstrap, `loading` tắt ngay.

## File liên quan

- `client/src/services/authSessionRestore.js`
- `client/src/services/bootstrapService.js`
- `api-gateway/src/bff/bootstrap.handler.js`
