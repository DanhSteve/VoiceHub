# Webhook Service

Webhook service được xây dựng bằng FastAPI để xử lý các events từ các microservices và tự động gửi notifications.

## Cấu trúc

```
webhook-service/
├── main.py                    # FastAPI application entry point
├── worker.py                  # Queue consumer entry point
├── src/
│   ├── handlers/             # Webhook handlers cho từng loại event
│   │   ├── friend_handler.py
│   │   ├── task_handler.py
│   │   ├── meeting_handler.py
│   │   ├── document_handler.py
│   │   ├── chat_handler.py
│   │   ├── role_handler.py
│   │   └── organization_handler.py
│   └── utils/
│       ├── webhook_queue.py   # Optional RabbitMQ queue bridge
│       └── notification_client.py  # Client để gọi Notification Service
├── requirements.txt
├── Dockerfile
└── ENV.example
```

## Các Webhook Events

### Friend Events
- `friend_request_accepted` - Khi friend request được chấp nhận
- `friend_request_sent` - Khi gửi friend request
- `friend_removed` - Khi xóa bạn bè

### Task Events
- `task_created` - Khi tạo task mới
- `task_assigned` - Khi assign task cho user
- `task_completed` - Khi task được hoàn thành
- `task_updated` - Khi task được cập nhật

### Meeting Events
- `meeting_created` - Khi tạo meeting mới
- `meeting_started` - Khi meeting bắt đầu
- `meeting_ended` - Khi meeting kết thúc
- `participant_joined` - Khi có người tham gia meeting

### Document Events
- `document_uploaded` - Khi upload document
- `document_updated` - Khi cập nhật document
- `document_shared` - Khi share document

### Chat Events
- `message_created` - Khi tạo message mới
- `message_mentioned` - Khi có mention trong message

### Role Events
- `role_assigned` - Khi assign role cho user
- `role_removed` - Khi remove role khỏi user

### Organization Events
- `server_member_added` - Khi thêm member vào server
- `server_member_removed` - Khi remove member khỏi server
- `organization_created` - Khi tạo organization mới

## Cách sử dụng

### 1. Gửi webhook từ Node.js service

```javascript
const { friendWebhook, taskWebhook } = require('../../shared');

// Gửi friend request accepted webhook
await friendWebhook.requestAccepted(userId, friendId, friendName);

// Gửi task created webhook
await taskWebhook.created(taskId, taskTitle, createdBy, assigneeId, organizationId);
```

### 2. Webhook Endpoints

Tất cả webhook endpoints yêu cầu header `X-Webhook-Secret` để xác thực.

**POST** `/webhook/friend`
```json
{
  "event_type": "friend_request_accepted",
  "userId": "user123",
  "friendId": "friend456",
  "friendName": "John Doe"
}
```

**POST** `/webhook/task`
```json
{
  "event_type": "task_created",
  "taskId": "task123",
  "taskTitle": "Complete project",
  "createdBy": "user123",
  "assigneeId": "user456",
  "organizationId": "org789"
}
```

## Environment Variables

```env
NODE_ENV=development
PORT=3016
WEBHOOK_SECRET=your-webhook-secret-key-change-this-in-production
NOTIFICATION_SERVICE_URL=http://notification-service:3003
WEBHOOK_ASYNC_QUEUE=false
WEBHOOK_DELIVERY_QUEUE=voicehub.webhook.delivery
WEBHOOK_DELIVERY_DLQ=voicehub.webhook.delivery.dlq
WEBHOOK_DELIVERY_MAX_RETRIES=6
# RABBITMQ_URL=amqp://voicehub:voicehub-dev-change-me@rabbitmq:5672
```

Nếu `WEBHOOK_ASYNC_QUEUE=false`, HTTP service sẽ dispatch trực tiếp qua `dispatch_domain_event()` và không cần RabbitMQ. Nếu bật queue mode, hãy chạy thêm `worker.py` và cung cấp `RABBITMQ_URL`.

## Security

- Tất cả webhook requests phải có header `X-Webhook-Secret` khớp với `WEBHOOK_SECRET`
- Webhook service chỉ giao tiếp với Notification Service nội bộ
- Không expose webhook endpoints ra ngoài

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run HTTP API locally
python main.py

# Run delivery worker locally
WEBHOOK_ASYNC_QUEUE=true RABBITMQ_URL=amqp://voicehub:voicehub-dev-change-me@rabbitmq:5672 python worker.py

# Run with Docker
docker build -t webhook-service .
docker run -p 3016:3016 webhook-service
```



