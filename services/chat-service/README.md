# Chat Service

Service quản lý tin nhắn và phòng chat với Socket.IO.

## Cấu hình môi trường

Tạo file `.env` trực tiếp trong thư mục `services/chat-service/` và cập nhật các giá trị:

```env
# Server
NODE_ENV=development
PORT=3006

# Database (Atlas)
MONGODB_URI=mongodb+srv://user:password@cluster0.xxx.mongodb.net/chat_db

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# JWT (để verify token từ auth-service)
JWT_SECRET=your-secret-key-change-in-production

# External Services
USER_SERVICE_URL=http://user-service:3004
ORGANIZATION_SERVICE_URL=http://organization-service:3013
```

## API Endpoints

- `POST /api/messages` - Tạo tin nhắn mới
- `GET /api/messages` - Lấy danh sách tin nhắn
- `GET /api/messages/:messageId` - Lấy tin nhắn theo ID
- `PATCH /api/messages/:messageId/read` - Đánh dấu đã đọc
- `DELETE /api/messages/:messageId` - Xóa tin nhắn

## Socket.IO

### Namespaces

- `/friends` - Chat giữa bạn bè
- `/servers` - Chat trong phòng/server

### Events

**Friend Chat:**
- `send_message` - Gửi tin nhắn
- `new_message` - Nhận tin nhắn mới
- `typing` / `stop_typing` - Typing indicator
- `mark_read` - Đánh dấu đã đọc

**Server/Room Chat:**
- `join_room` - Tham gia phòng
- `leave_room` - Rời phòng
- `send_message` - Gửi tin nhắn trong phòng
- `new_message` - Nhận tin nhắn mới
- `typing` / `stop_typing` - Typing indicator

## Chạy service

```bash
# Development
npm run dev

# Production
npm start
```


