# VoiceHub — Message queue (RabbitMQ)

## Broker

- **Exchange:** `voicehub.topic` (type `topic`, durable)
- **Routing key:** `friend.dm`
- **Queue:** `voicehub.friend.dm` (durable), DLQ: `voicehub.friend.dm.dlq`

## Payload (JSON, UTF-8)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `v` | number | yes | Schema version (`1`) |
| `correlationId` | string (UUID) | yes | Idempotency key; consumer skips duplicate trong Redis |
| `senderId` | string | yes | Auth user id (ObjectId string) |
| `receiverId` | string | yes | Recipient user id |
| `content` | string | yes | Plain text (encrypted at rest in chat-service) |
| `messageType` | string | no | `text` (default), `image`, `file`, `system` |
| `enqueuedAt` | string ISO | no | Server timestamp |

## Environment

- `RABBITMQ_URL` — e.g. `amqp://voicehub:pass@rabbitmq:5672`
- `FRIEND_DM_USE_QUEUE` — `true` | `false` (default: `true` khi có `RABBITMQ_URL`)

## Health

- Management UI: port `15672` (docker)
- `rabbitmq-diagnostics ping` trong container
