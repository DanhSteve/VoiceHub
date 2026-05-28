---
name: wave-2c-s2s-readmodel-acl
overview: Sóng 2 — Read model ACL trong chat-service; giảm HTTP sync org mỗi request; chuẩn bị event sync (Sóng 3).
todos:
  - id: local-collection
    content: Collection UserOrgChannelAccess trong chat-service
    status: completed
  - id: sync-on-miss
    content: Miss cache → fetch org một lần → ghi local + Redis
    status: completed
  - id: circuit-breaker
    content: Timeout/circuit khi org-service down
    status: completed
  - id: event-consumer-stub
    content: Queue consumer invalidate/update ACL (liên kết wave-3a)
    status: completed
isProject: false
---

# Wave 2C — S2S read model (ACL local)

**Sóng:** 2 — Org (BE)  
**Phụ thuộc:** [wave-2b-redis-acl-cache.plan.md](./wave-2b-redis-acl-cache.plan.md), một phần [wave-2e](./wave-2e-cursor-pagination-dto.plan.md)  
**Tiếp theo:** [wave-3a-event-read-models.plan.md](./wave-3a-event-read-models.plan.md)  
**Giải quyết:** #2

## Tiền đề — Dev `https://voicehub.local`

> Checklist chung: [_lan-dev-preamble-snippet.md](./_lan-dev-preamble-snippet.md) · [docs/lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md)

### Riêng wave 2C (S2S read-model)

- Mọi HTTP nội bộ: `http://organization-service:3013`, `http://chat-service:3006`, … — **không** `http://<IP-WiFi>:...`.
- Không đổi `CORS` / gateway vì refactor S2S — browser vẫn một origin `https://voicehub.local`.
- Verify: org chat search trên máy LAN — không spike request tới IP/port lạ trong DevTools.

## Mục tiêu

`chat-service` **không** gọi `GET .../accessible-channel-ids` trên **mỗi** search/list khi đã có bản local fresh.

## Hiện trạng

- `fetchAccessibleChannelIds` — `message.controller.js` (~L67)
- `fetchAccessibleChannelPermissionMatrix` — list/delete ACL
- `assertCanWriteInOrgChannel` — POST message + socket

## Phase 2C.1 (không cần Rabbit ngay)

1. Model `UserOrgChannelAccess`: `{ userId, organizationId, channelIds[], permissionsByChannelId, scope, updatedAt }`
2. Flow read:
   - Redis hit (2b) → return
   - Mongo local fresh (`updatedAt` < 5 phút) → return
   - HTTP org → upsert local + Redis
3. Circuit: 3 fail liên tiếp → short-circuit 30s, trả 503 có message rõ.

## Phase 2C.2 (chuẩn bị 3a)

- Publisher org-service: `org.acl.updated` routing key khi role/channel đổi.
- Consumer chat-service: upsert/delete local row.

Dùng **RabbitMQ hiện có** (pattern `friendDmConsumer`, `notificationDispatch.worker`) — không Kafka trừ khi team quyết định riêng.

## File chính

- `services/chat-service/src/models/UserOrgChannelAccess.js`
- `services/chat-service/src/services/orgAccessReadModel.js`
- Sửa `orgChannelPermissions.js`, `message.controller.js`
- `services/organization-service/src/messaging/` (publisher mới)

## Tiêu chí hoàn thành

- [ ] Org search 10 request liên tiếp: ≤1 HTTP tới org-service (warm cache)
- [ ] Org down: chat read degrade có kiểm soát (không treo 30s×retry)
- [ ] E2E ACL checklist pass

## PR gợi ý

PR1 local model + read path. PR2 publisher org (feature flag). PR3 consumer (flag).
