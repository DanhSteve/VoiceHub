---
name: wave-3b-search-engine
overview: Sóng 3 — Tách search message/file sang engine chuyên dụng (Meilisearch/Typesense/ES); không search Mongo runtime scale lớn.
todos:
  - id: engine-choice
    content: Chọn engine (đề xuất Meilisearch — ops nhẹ hơn ES)
    status: completed
  - id: index-pipeline
    content: Indexer từ message create/update/delete events
    status: completed
  - id: search-api
    content: search-service hoặc chat-service proxy search endpoint
    status: completed
  - id: org-search-fe
    content: Thay fetchOrgMessageSearch Mongo bằng search API
    status: completed
  - id: backfill
    content: Job backfill org messages có attachment
    status: completed
isProject: false
---

# Wave 3B — Search engine

**Sóng:** 3  
**Phụ thuộc:** [wave-2e-cursor-pagination-dto.plan.md](./wave-2e-cursor-pagination-dto.plan.md), [wave-3a](./wave-3a-event-read-models.plan.md) (index pipeline)  
**Giải quyết:** #8

## Tiền đề — Dev `https://voicehub.local`

> Checklist chung: [_lan-dev-preamble-snippet.md](./_lan-dev-preamble-snippet.md) · [docs/lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md)

### Riêng wave 3B (search)

- Browser chỉ gọi gateway `GET /api/.../search` — **không** expose URL Elasticsearch/OpenSearch ra `client/.env`.
- Org workspace search UI: test từ `https://voicehub.local/w/...` trên máy LAN.

## Mục tiêu

`GET /messages/search` không dùng Mongo regex/text khi volume lớn.

## Phạm vi v1

- Org channel message search (text + hasAttachment filter)
- File name search trong org documents overview
- **Không** thay DM search ngay (phase 2)

## Kiến trúc

```mermaid
flowchart LR
  Chat[chat_service] -->|publish message.*| Q[RabbitMQ]
  Q --> Idx[indexer_worker]
  Idx --> MS[Meilisearch]
  Client --> API[GET /search/messages]
  API --> MS
  API --> ACL[org ACL cache]
```

ACL: filter `roomId in allowedChannelIds` **sau** search (hoặc filter trong index theo orgId+roomId).

## Index fields

`messageId, organizationId, roomId, content, senderDisplayName, hasAttachment, attachments.name, createdAt`

## Client

- `client/src/features/search/orgChatSearchConfig.js` → endpoint mới
- `useOrganizationDocuments` dùng search + overview (2d)

## Tiêu chí hoàn thành

- [ ] Search 10k+ messages org <500ms p95 trên staging
- [ ] Kết quả respect ACL (user không thấy room cấm)

## PR gợi ý

PR1 docker meilisearch + indexer. PR2 API + FE. PR3 backfill script.
