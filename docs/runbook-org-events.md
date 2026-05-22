# Runbook — Org events (Wave 3A)

Exchange: `voicehub.topic` (env `RABBITMQ_EXCHANGE`).

## Catalog

| Routing key | Publisher | Consumers |
|-------------|-----------|-----------|
| `org.member.joined` | organization-service | chat, notification |
| `org.member.removed` | organization-service | chat, notification |
| `org.role.updated` | organization-service | chat, notification |
| `org.channel.provisioned` | organization-service | chat |
| `org.deleted` | organization-service | chat, notification |
| `org.acl.updated` | organization-service | chat (legacy invalidate) |

Chi tiết: `shared/messaging/orgEvents.js` (`ORG_EVENT_CATALOG`).

## Bật tính năng

```env
# organization-service
ORG_ACL_EVENTS_ENABLED=true
RABBITMQ_URL=amqp://...

# chat-service
ORG_ACL_CONSUMER_ENABLED=true

# notification-service
ORG_EVENTS_CONSUMER_ENABLED=true
```

## Idempotency

Redis key `org:acl:event:{eventId}` TTL 24h (`ORG_EVENT_IDEMPOTENCY_TTL_SEC`).

## DLQ

- Chat: `voicehub.org.events.chat.dlq` (`RABBITMQ_ORG_EVENTS_CHAT_DLQ`)
- Notification: `voicehub.org.events.notification.dlq`

Khi Rabbit down: publisher log warn, HTTP invalidate vẫn chạy (read path eventual consistency khi broker lên lại).

## Verify

1. Đổi role member → trong ≤5s search org message đúng room (không F5).
2. Rabbit tạm stop → không crash service; publish skip.
