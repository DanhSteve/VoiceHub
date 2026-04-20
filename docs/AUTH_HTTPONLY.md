# Auth: hướng tới refresh httpOnly

## Hiện trạng đã có trong client

- `client/src/utils/tokenStorage.js`: JWT access có thể lưu **sessionStorage** thay vì localStorage nếu đặt `VITE_TOKEN_STORAGE=sessionStorage` (giảm thời gian sống token sau XSS).
- `AuthContext` / `api.js` / `SocketContext` dùng chung helper `getToken` / `setToken` / `removeToken`.

## Lộ trình đề xuất (chưa bắt buộc)

1. Auth-service trả **refresh token** chỉ qua cookie `httpOnly`, `Secure`, `SameSite`.
2. Access token ngắn hạn trong bộ nhớ (hoặc sessionStorage).
3. Endpoint refresh chỉ đọc cookie, trả access token mới.
4. Đồng bộ CORS + credentials cho gateway và client.

Triển khai cần rà soát bảo mật riêng; không gộp vào một PR với thay đổi business khác.
