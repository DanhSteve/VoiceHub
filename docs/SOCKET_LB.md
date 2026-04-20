# Socket.IO qua Load Balancer (không qua API Gateway)

## Mục tiêu

Giảm tải WebSocket trên gateway: client kết nối trực tiếp `wss://socket.<domain>` (hoặc cổng riêng) tới pool **socket-service**.

## Cấu hình client

- Đặt `VITE_SOCKET_URL` trỏ tới URL công khai của LB (ví dụ `https://socket.example.com` — code client tự thêm namespace `/chat`).
- CORS trên **socket-service** (`CORS_ORIGIN`) phải gồm origin frontend.

## Hạ tầng

- TLS tại LB (terminate SSL).
- Sticky session **không** bắt buộc nếu đã bật **Redis adapter** (`@socket.io/redis-adapter`) và nhiều replica socket-service.

## Docker

Trong môi trường dev hiện tại, Socket.IO vẫn có thể đi qua gateway `http://localhost:3000` (proxy `/socket.io`).
