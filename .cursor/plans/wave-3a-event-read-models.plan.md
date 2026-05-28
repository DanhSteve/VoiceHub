---
name: wave-3a-event-read-models
overview: Sóng 3 — Event-driven đồng bộ read model (ACL, org metadata) qua RabbitMQ; hạn chế S2S runtime.
todos:
  - id: event-catalog
    content: Danh mục event org.member.* org.channel.* org.role.*
    status: completed
  - id: org-publishers
    content: organization-service publish sau mutation thành công
    status: completed
  - id: chat-consumer
    content: chat-service consumer cập nhật UserOrgChannelAccess
    status: completed
  - id: notification-consumer
    content: notification-service invalidate count cache (nếu có)
    status: completed
  - id: idempotency
    content: Redis NX correlation id cho consumer (pattern friendDmConsumer)
    status: completed
isProject: false
---

# Wave 3A — Event read models

**Sóng:** 3 — Hạ tầng  
**Phụ thuộc:** [wave-2c-s2s-readmodel-acl.plan.md](./wave-2c-s2s-readmodel-acl.plan.md)  
**Giải quyết:** #2 (dài hạn)

## Tiền đề — Dev `https://voicehub.local`

> Checklist chung: [_lan-dev-preamble-snippet.md](./_lan-dev-preamble-snippet.md) · [docs/lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md)

### Riêng wave 3A (events)

- RabbitMQ/worker: nội bộ Docker — không cấu hình theo IP LAN browser.
- FE invalidate React Query: socket kết nối `wss://voicehub.local` (gateway), không `ws://IP:3017`.

## Mục tiêu

Thay sync HTTP “request đang chạy” bằng **eventual consistency** có kiểm soát (<5s).

## Event catalog (draft)

| Event | Publisher | Consumer |
|-------|-----------|----------|
| `org.member.joined` | organization-service | chat, notification |
| `org.member.removed` | organization-service | chat |
| `org.role.updated` | organization-service | chat |
| `org.channel.provisioned` | organization-service | chat |
| `org.deleted` | organization-service | chat purge (đã có cascade) |

Exchange: `voicehub.topic` (đồng bộ socket-service publisher).

## Implementation

- `organization-service/src/messaging/orgEvents.publisher.js`
- `chat-service/src/workers/orgAclConsumer.js`
- Env: `RABBITMQ_URL`, feature flag `ORG_ACL_EVENTS_ENABLED=true`

## Idempotency

Key `org:acl:event:{eventId}` TTL 24h — skip duplicate.

## Tiêu chí hoàn thành

- [ ] Đổi role → search message đúng room trong ≤5s không F5
- [ ] Không tăng error rate khi Rabbit tạm down (DLQ + alert)

## PR gợi ý

PR1 publish. PR2 consume chat. PR3 doc runbook.
