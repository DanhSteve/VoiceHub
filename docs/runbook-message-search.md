# Runbook — Org message search (Meilisearch, wave 3B)

## Kiến trúc

- `chat-service` publish `message.created|updated|deleted` → RabbitMQ topic `voicehub.topic`
- Worker `messageSearchIndexer` upsert/xóa index `org_messages` trên Meilisearch
- `GET /api/messages/search?organizationId=…` — gateway proxy; khi Meili sẵn sàng dùng engine, không thì Mongo fallback
- ACL: filter `roomId` trong Meilisearch theo danh sách kênh được phép (từ organization-service / cache)

## Biến môi trường (`services/chat-service/.env`)

| Biến | Mô tả |
|------|--------|
| `MEILI_HOST` | URL nội bộ Docker, ví dụ `http://meilisearch:7700` |
| `MEILI_MASTER_KEY` | Khớp `MEILI_MASTER_KEY` trong `docker-compose.infra.yml` |
| `MESSAGE_SEARCH_ENGINE` | `meilisearch` / `off` / `auto` |
| `MESSAGE_SEARCH_INDEXER_ENABLED` | `true` để chạy consumer |
| `MESSAGE_SEARCH_PUBLISH_ENABLED` | `true` để publish sau create/edit/delete/recall |

**Không** đặt URL Meilisearch trong `client/.env`.

## Khởi động

```bash
docker compose up -d meilisearch
docker compose restart chat-service
```

## Backfill (lần đầu hoặc sau sự cố index)

Trong container (khuyến nghị):

```bash
docker compose exec chat-service npm run backfill:message-search
```

Trên máy host (Windows/macOS) — script tự map `/shared`; đặt `MEILI_HOST=http://127.0.0.1:7700` nếu `.env` dùng `http://meilisearch:7700`:

```bash
cd services/chat-service
npm run backfill:message-search
# Chỉ tin có file đính kèm:
node src/scripts/backfillMessageSearchIndex.js --hasAttachment
# Một org:
node src/scripts/backfillMessageSearchIndex.js --orgId=<organizationId>
```

## Kiểm thử LAN

1. `https://voicehub.local/w/<slug>` — ô search kênh org
2. Tab Documents — overview attachment (organization-service → chat search)
3. User không có quyền kênh → không thấy tin kênh đó trong kết quả

## Sự cố

| Triệu chứng | Hướng xử lý |
|-------------|-------------|
| Search chậm / regex | Meili down → kiểm tra log fallback Mongo; `docker logs enterprise-meilisearch` |
| Kết quả thiếu tin mới | Indexer tắt hoặc queue backlog → bật `MESSAGE_SEARCH_INDEXER_ENABLED`, xem queue Rabbit |
| Kết quả lệch ACL | Invalidate ACL org (wave 3a), kiểm tra `allowedRoomIds` trong log search |
