# Quan sát hệ thống (VoiceHub)

## API Gateway

- `GET /metrics` — JSON: `uptime`, `service`, `timestamp` (không auth; public).
- Rate limit: `express-rate-limit`, cấu hình `GATEWAY_RATE_LIMIT_MAX` (mặc định 300 req/phút/IP cho prefix `/api`).
- Cache permission: `GATEWAY_PERMISSION_CACHE_TTL_MS` (mặc định 60000 ms).

## RabbitMQ

- Management UI: cổng host `15672` (docker-compose).
- Queue DM: `voicehub.friend.dm` (xem `docs/MESSAGE_QUEUE_SCHEMA.md`).

## Redis

- Presence keys: `vh:presence:{userId}` (TTL ~120s, socket-service).
- Cache DM list: `dm:last:{sortedPair}` (chat-service, TTL 60s).

## Performance baseline (Wave 0)

- [perf-baseline-2026-05.md](./perf-baseline-2026-05.md) — inventory request theo màn + cột p95 điền tay.
- [api-read-pagination-contract.md](./api-read-pagination-contract.md) — chuẩn `cursor` / `limit` / `fields=summary`.
- [populate-audit-wave0.md](./populate-audit-wave0.md) — audit populate cross-service.

## Gợi ý mở rộng

- Prometheus + Grafana cho từng service.
- ELK/OpenSearch cho log tập trung.
- Cảnh báo khi consumer DM lỗi liên tục (queue depth).
