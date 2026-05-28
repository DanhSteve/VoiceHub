---
name: wave-2b-redis-acl-cache
overview: Sóng 2 — Redis cache ACL channel, structure summary, org list; invalidate khi membership/role đổi.
todos:
  - id: acl-cache-org
    content: Cache GET accessible-channel-ids trong organization-service
    status: completed
  - id: structure-summary-cache
    content: Cache structure summary (không full tree nếu nặng)
    status: completed
  - id: invalidate-hooks
    content: Del cache khi join/leave, role change, channel provision
    status: completed
  - id: chat-read-cache
    content: chat-service đọc ACL từ cache key thay HTTP mỗi search (miss → org)
    status: completed
isProject: false
---

# Wave 2B — Redis ACL & org read cache

**Sóng:** 2 — Org (BE trước)  
**Phụ thuộc:** [wave-1c-public-pages-optimize.plan.md](./wave-1c-public-pages-optimize.plan.md)  
**Tiếp theo:** [wave-2a-org-shell.plan.md](./wave-2a-org-shell.plan.md)  
**Giải quyết:** #2 (ngắn hạn), #3

## Tiền đề — Dev `https://voicehub.local`

> Checklist chung: [_lan-dev-preamble-snippet.md](./_lan-dev-preamble-snippet.md) · [docs/lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md)

### Riêng wave 2B (Redis ACL cache)

- Redis/S2S chỉ backend — **không** thêm URL absolute (`localhost`, IP LAN) vào JSON cache trả client.
- `ROLE_PERMISSION_SERVICE_URL`, `ORGANIZATION_SERVICE_URL`: hostname Docker trong `.env` service.
- Sau deploy: user LAN vẫn chỉ gọi `https://voicehub.local/api/...` — verify ACL channel list trên máy client khác.

## Mục tiêu

`GET /organizations/:orgId/accessible-channel-ids` không tính lại DB mỗi lần chat search/list.

## Hiện trạng

- Org: **không** cache ACL — `organizationController.getAccessibleChannelIds`
- Chat: `fetchAccessibleChannelIds` HTTP + retry — `message.controller.js`, `orgChannelPermissions.js`
- Redis pattern có sẵn: `organization:{id}` 3600s — `organization.service.js`
- Permission: `permissions:{userId}:{serverId}` 300s — `role-permission-service`

## Key đề xuất

| Key | TTL | Payload |
|-----|-----|---------|
| `org:{orgId}:acl:{userId}` | 120–300s | `{ channelIds, permissionsByChannelId, scope }` |
| `org:{orgId}:structure:summary` | 300–900s | departments count + channel ids flat (tùy FE) |
| `user:{userId}:orgs` | 120s | list org my (optional) |

## Invalidate

Khi các API sau thành công → `del` pattern:

- Member join/leave/kick
- Role assign (`syncUserOrgRole`)
- Channel create/delete/rename
- Department structure provision

File gợi ý: `organization-service` controllers membership, channel, structure.

## Chat-service (phase ngắn)

Trước read model (wave-2c): trên cache miss vẫn gọi org; trên hit đọc Redis **cùng key** (shared convention) hoặc gateway cache — tránh duplicate logic.

## Tiêu chí hoàn thành

- [ ] Search org messages 2 lần liên tiếp: lần 2 không gọi org HTTP (cache hit)
- [ ] Sau đổi role: cache miss → ACL mới đúng trong 5s
- [ ] Không lộ channel user không được phép (test checklist `docs/channel-acl-e2e-checklist.md`)

## PR gợi ý

PR1 org-service cache + invalidate. PR2 chat-service consume cache.
