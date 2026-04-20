# Tách database theo service

## Mục tiêu

Giảm contention và ảnh hưởng chéo khi một collection (ví dụ `messages`) lớn.

## VoiceHub

- **chat-service** hỗ trợ biến `CHAT_MONGODB_URI`: nếu set, service kết nối URI này; nếu không, dùng `MONGODB_URI` như cũ.
- Shard message theo `conversationId` / cặp DM là bước migration sau (index, routing key, hoặc DB riêng theo tenant).

## Triển khai

1. Tạo database/user Mongo riêng cho chat.
2. Đặt `CHAT_MONGODB_URI` trong env chat-service.
3. Chạy migration dữ liệu (snapshot + replay) trong cửa sổ bảo trì.
