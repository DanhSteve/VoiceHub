# API contract — đọc danh sách (pagination & DTO)

> Chuẩn Wave 0; triển khai dần ở Sóng 2e (`wave-2e-cursor-pagination-dto.plan.md` — tên file legacy).

## Hai kiểu phân trang

### A. Theo thời gian (`before` / `nextBefore`) — đang dùng notifications

Danh sách sort `createdAt` giảm dần (mới nhất trước). Trang tiếp theo = bản ghi **cũ hơn** mốc cuối trang hiện tại.

| Hướng | Tên field | Ý nghĩa |
|--------|-----------|---------|
| Request | `before` | ISO8601 — chỉ lấy bản ghi có `createdAt` **nhỏ hơn** giá trị này |
| Response | `nextBefore` | Gửi lại làm `before` ở request kế tiếp (thường = `createdAt` của item cuối trang) |
| Response | `hasMore` | Còn trang sau hay không |

Ví dụ: `GET /api/notifications?limit=20&scope=personal`  
Load more: `GET /api/notifications?limit=20&before=2025-05-20T10:00:00.000Z`

### B. Token opaque (`pageToken` / `nextPageToken`) — messages, search (2e)

| Hướng | Tên field | Ý nghĩa |
|--------|-----------|---------|
| Request | `pageToken` | Chuỗi opaque do server cấp ở lần trước |
| Response | `nextPageToken` | Token cho trang kế; `null` nếu hết |
| Response | `hasMore` | Còn dữ liệu hay không |

Payload decode (server): `{ "createdAt": "<ISO8601>", "id": "<ObjectId>" }` → base64url.

```js
function decodePageToken(raw) {
  if (!raw) return null;
  try {
    const json = Buffer.from(String(raw), 'base64url').toString('utf8');
    const { createdAt, id } = JSON.parse(json);
    if (!createdAt || !id) return null;
    return { createdAt: new Date(createdAt), id: String(id) };
  } catch {
    return null;
  }
}
```

Query tiếp theo (sort `createdAt` desc, `_id` desc):

```js
{ $or: [
  { createdAt: { $lt: pageToken.createdAt } },
  { createdAt: pageToken.createdAt, _id: { $lt: pageToken.id } },
]}
```

## Query parameters chung

| Param | Kiểu | Mặc định | Max | Mô tả |
|-------|------|----------|-----|--------|
| `limit` | number | 20 (list UI), 50 (admin) | 100 | Số bản ghi mỗi trang |
| `before` | string (ISO) | — | — | Phân trang theo thời gian (notifications) |
| `pageToken` | string | — | — | Phân trang token (messages, search) |
| `page` | number | 1 | — | **Deprecated** — giữ tương thích 1 phiên bản |
| `fields` | string | `summary` | — | `summary` \| `full` |

## Response envelope (token mode)

```json
{
  "success": true,
  "data": {
    "items": [],
    "nextPageToken": "eyJjcmVhdGVkQXQiOi4uLiwiaWQiOi4uLn0",
    "hasMore": true,
    "total": null
  }
}
```

Legacy page mode:

```json
{
  "messages": [],
  "currentPage": 1,
  "totalPages": 5,
  "total": 100
}
```

Khi có `pageToken` request → ưu tiên trả `items` + `nextPageToken`; khi chỉ có `page` → giữ shape cũ.

## DTO `fields=summary`

Áp dụng cho: `GET /messages`, `GET /messages/search`, `GET /notifications`, `GET /documents`.

| Entity | summary (không populate) | full |
|--------|--------------------------|------|
| Message | `_id, senderId, senderDisplayName, content, messageType, roomId, organizationId, createdAt, fileMeta, signedReadUrl` | + reactions, reply chain |
| Notification | `_id, type, title, content, isRead, createdAt, data, actionUrl` | + audit fields |
| Document | `_id, name, fileUrl, mimeType, fileSize, uploadedBy, uploadedByDisplayName, organizationId, createdAt` | + versions, tags đầy đủ |

**Quy tắc microservice:** Không `.populate('User')` nếu model `User` chưa đăng ký trong service — dùng denormalize hoặc `fetchUserProfileByIdInternal` (xem `docs/populate-audit-wave0.md`).

## Endpoint áp dụng (theo thứ tự implement)

1. `GET /api/notifications` — `before` + `nextBefore` (notification-service)
2. `GET /api/messages` — `pageToken` + `nextPageToken` (chat-service)
3. `GET /api/messages/search` — `pageToken` + `nextPageToken` (chat-service)
4. `GET /api/documents` — `pageToken` khi list lớn (document-service)

## Client

- `@tanstack/react-query` `useInfiniteQuery`:
  - Notifications: `getNextPageParam: (last) => last.nextBefore`
  - Messages/search: `getNextPageParam: (last) => last.nextPageToken`
- Không loop `page` 1..N trên mount (Dashboard, org documents — dùng overview API 2d).

## Versioning

Header tùy chọn: `X-Api-Read-Version: 2` khi client chỉ dùng token/pageToken. Mặc định không header → hỗ trợ cả `page` và `before` / `pageToken`.
