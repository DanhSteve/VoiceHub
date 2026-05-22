---
name: wave-2e-cursor-pagination-dto
overview: Sóng 2 — Phân trang pageToken / before + DTO mỏng cho messages, notifications, search; index Mongo. (Tên file plan giữ `cursor` — contract dùng pageToken/nextBefore.)
todos:
  - id: messages-cursor
    content: chat-service GET /messages pageToken (roomId, organizationId)
    status: completed
  - id: notifications-cursor
    content: notification-service nextBefore + fields summary (đồng bộ contract)
    status: completed
  - id: search-cursor
    content: messages/search pageToken thay page 1..8
    status: completed
  - id: dto-lean
    content: Bỏ populate sâu; trả senderDisplayName denormalized
    status: completed
  - id: fe-infinite
    content: useInfiniteQuery + infinite scroll UI
    status: completed
isProject: false
---

# Wave 2E — Page-token pagination & DTO lean

**Sóng:** 2 — Org + shared APIs  
**Phụ thuộc:** [wave-2a-org-shell.plan.md](./wave-2a-org-shell.plan.md), contract [wave-0](./wave-0-observability.plan.md) · [docs/api-read-pagination-contract.md](../../docs/api-read-pagination-contract.md)  
**Tiếp theo:** [wave-2c](./wave-2c-s2s-readmodel-acl.plan.md), [wave-3b](./wave-3b-search-engine.plan.md)  
**Giải quyết:** #6, #7

> **Đặt tên:** Không dùng `cursor` / `nextCursor` trong API JSON — tránh nhầm Redis SCAN / CSS. Xem contract: `before`+`nextBefore` (notifications) và `pageToken`+`nextPageToken` (messages/search).

## Tiền đề — Dev `https://voicehub.local`

> Checklist chung: [_lan-dev-preamble-snippet.md](./_lan-dev-preamble-snippet.md) · [docs/lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md)

### Riêng wave 2E (pagination)

- `pageToken` opaque trong JSON — client ghép query relative (`/api/...?pageToken=`), không prefix host.
- Notifications: `?before=<ISO>` + response `nextBefore`.
- Load-more org chat / notifications: test scroll từ `https://voicehub.local` (máy LAN).

## Contract (theo wave-0 / docs)

**Messages / search (token):**

**Request:** `?limit=50&pageToken=<opaque>`

**Response:**

```json
{
  "items": [],
  "nextPageToken": "..." | null,
  "hasMore": true
}
```

Token encode: `{ "createdAt": "ISO", "id": "ObjectId" }` base64url — decode server: `decodePageToken`.

**Notifications (theo thời gian):**

**Request:** `?limit=20&before=<ISO8601>`  
**Response:** `nextBefore` (giá trị `createdAt` của item cuối trang), `hasMore`.

**Backward compatible:** giữ `page` + `limit` deprecated 1 version; log warning.

## Services

| Service | Endpoint | Ghi chú |
|---------|----------|---------|
| chat-service | `GET /messages`, `GET /messages/search` | `pageToken` / `nextPageToken`; index `{ roomId, createdAt, _id }` |
| notification-service | `GET /notifications` | `before` / `nextBefore`; scope + orgId |
| document-service | `GET /documents` | `pageToken` nếu list lớn |

## DTO lean

- Không populate `User` nếu model không register.
- Message list item: `_id, content, type, senderId, senderDisplayName, createdAt, attachments[]` (summary).
- `fields=full` chỉ detail view.

## Frontend

- `@tanstack/react-query` `useInfiniteQuery`
- Notifications: `getNextPageParam: (last) => last.nextBefore`
- Messages: `getNextPageParam: (last) => last.nextPageToken`
- Thay loop `MAX_ATTACHMENT_PAGES` bằng overview API (2d) hoặc infinite search.

## Tiêu chí hoàn thành

- [ ] Org message history scroll: không load 100 tin một lần
- [ ] Payload list giảm ≥30% bytes (sample 50 items)
- [ ] Index explain không COLLSCAN trên dev

## PR gợi ý

PR1 BE messages + notifications. PR2 FE infinite scroll. PR3 search pageToken.
