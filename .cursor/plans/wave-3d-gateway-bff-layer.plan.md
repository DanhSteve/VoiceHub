---
name: wave-3d-gateway-bff-layer
overview: Sóng 3 — Mở rộng Gateway thành BFF có cache, aggregation, request coalescing (sau bootstrap/shell ổn định).
todos:
  - id: bff-structure
    content: Thư mục api-gateway/src/bff/ tách bootstrap, overview handlers
    status: completed
  - id: response-cache
    content: Redis cache GET bootstrap/shell theo userId (TTL ngắn)
    status: completed
  - id: request-coalescing
    content: In-flight dedupe cùng key khi nhiều tab
    status: completed
  - id: migrate-aggregates
    content: Di chuyển aggregate từ org-service sang gateway nếu cần cross-service
    status: completed
isProject: false
---

# Wave 3D — Gateway BFF layer

**Sóng:** 3  
**Phụ thuộc:** [wave-1b-bootstrap-gateway.plan.md](./wave-1b-bootstrap-gateway.plan.md), [wave-2a-org-shell.plan.md](./wave-2a-org-shell.plan.md), [wave-2d-org-pages-overview.plan.md](./wave-2d-org-pages-overview.plan.md)  
**Giải quyết:** #10

## Tiền đề — Dev `https://voicehub.local`

> Checklist chung: [_lan-dev-preamble-snippet.md](./_lan-dev-preamble-snippet.md) · [docs/lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md)

### Riêng wave 3D (BFF layer)

- Mọi BFF read (`/api/bootstrap`, `/api/.../overview`, …): mount dưới **`/api`** — Nginx `location /api/` → gateway.
- **Không** expose BFF ra port 3000 trực tiếp cho browser LAN.
- Proxy tĩnh mới (nếu có): làm giống `/uploads` — Nginx + gateway `pathRewrite` nếu mount strip prefix.
- Cache Redis BFF: key theo `userId` — không lưu URL absolute localhost trong cached JSON.
- Verify: tab LAN load bootstrap + org shell — chỉ host `voicehub.local`.

## Mục tiêu

Gateway không chỉ proxy: **gom**, **cache**, **dedupe** các read endpoint shell/overview.

## Nguyên tắc

- BFF chỉ **read aggregation** — không business logic chat/org.
- Write path vẫn proxy thẳng microservice.
- Không duplicate permission check — vẫn 1 JWT + permission middleware.

## Module structure

```
api-gateway/src/bff/
  bootstrap.handler.js    # đã có từ 1b
  orgShell.handler.js     # optional wrap 2a
  cache.js                # Redis get/set
  coalesce.js             # in-memory Map in-flight
  httpDownstream.js       # shared internal client
```

## Cache layer

| Route | Key | TTL |
|-------|-----|-----|
| GET /api/bootstrap | `bff:bootstrap:{userId}` | 30–60s |
| GET /api/organizations/:id/shell | `bff:shell:{userId}:{orgId}` | 60s |

Invalidate: không cần chính xác tuyệt đối — TTL ngắn + socket `org:shell:updated` (3c).

## Request coalescing

Hai request đồng thời cùng key → một downstream flight, share Promise.

## Khi nào aggregate tại gateway vs service

| Trường hợp | Nơi aggregate |
|------------|---------------|
| Chỉ data 1 service | Service (2d documents-overview) |
| Cross-service (bootstrap) | Gateway BFF |
| Cần cache chung mọi client | Gateway |

## Tiêu chí hoàn thành

- [ ] 10 user F5 cùng lúc: downstream org calls không nhân 10 (coalesce + cache)
- [ ] Latency bootstrap p95 giảm so với 1b không cache

## PR gợi ý

PR1 bff module + redis. PR2 coalesce. PR3 doc architecture diagram gateway.
