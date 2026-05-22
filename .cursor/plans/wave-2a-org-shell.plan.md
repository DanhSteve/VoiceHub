---
name: wave-2a-org-shell
overview: Sóng 2 — GET /organizations/:orgId/shell gom metadata + ACL + badges; FE hydrate WorkspaceContext.
todos:
  - id: shell-endpoint
    content: organization-service hoặc gateway aggregate GET .../shell
    status: completed
  - id: shell-contract
    content: JSON v1 (org, structureSummary, acl, taskScope, notifUnread)
    status: completed
  - id: org-page-load
    content: OrganizationsPage thay 3 effect structure/ACL/taskScope bằng shell
    status: completed
  - id: query-org-shell
    content: useQuery ['org', orgId, 'shell'] invalidate khi đổi org sidebar
    status: completed
  - id: slug-resolve
    content: /w/:slug vẫn resolve by-slug rồi fetch shell
    status: completed
isProject: false
---

# Wave 2A — Org shell endpoint

**Sóng:** 2 — Org  
**Phụ thuộc:** [wave-2b-redis-acl-cache.plan.md](./wave-2b-redis-acl-cache.plan.md)  
**Tiếp theo:** [wave-2d](./wave-2d-org-pages-overview.plan.md), [wave-2e](./wave-2e-cursor-pagination-dto.plan.md)  
**Giải quyết:** #1, #4 (org context)

## Tiền đề — Dev `https://voicehub.local`

> Checklist chung: [_lan-dev-preamble-snippet.md](./_lan-dev-preamble-snippet.md) · [docs/lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md)

### Riêng wave 2A (org shell)

- Route workspace: `https://voicehub.local/w/:slug` — `organizationAPI` / `useQuery` chỉ path `/api/organizations/...`.
- Deep link / slug resolve: không embed `http://localhost` trong redirect sau join org.
- Shell endpoint (gateway hoặc org-service): client gọi relative; server aggregate vẫn Docker hostname nội bộ.
- Verify: chọn org trên sidebar từ máy LAN — một request shell (hoặc 3 request cũ) đều qua `voicehub.local`, 200.

## Lý do route mới

Khi chọn org, client hiện gọi **song song**:

- `GET /organizations/:id/structure`
- `GET /organizations/:id/accessible-channel-ids`
- `GET /organizations/:id/task-workspace-scope`

→ 3 JWT + 3 DB round-trip. Shell = 1 request.

## Vị trí implement (chọn một)

| Cách | Ưu | Nhược |
|------|-----|-------|
| **A. organization-service** `GET /:orgId/shell` | Logic ACL đã ở org | Client vẫn 1 hop |
| **B. api-gateway aggregate** | 1 client call chắc chắn | Thêm BFF logic gateway |

**Đề xuất:** **A** trước (ít đụng gateway); B khi cần gộp notification org count.

## Response contract v1

```json
{
  "organization": { "id", "name", "slug", "icon" },
  "structureSummary": { "departments": [], "channelsFlat": [] },
  "access": {
    "channelIds": [],
    "permissionsByChannelId": {},
    "scope": "all|department|..."
  },
  "taskWorkspaceScope": { "canViewAll": false, "departmentIds": [] },
  "badges": { "notificationsUnreadOrg": 0 }
}
```

Dùng cache wave-2b bên trong handler.

## File client

- `client/src/hooks/queries/useOrgShell.js`
- `client/src/pages/Workspace/OrganizationsPage.jsx` — bỏ 3 `useEffect` loader riêng khi có shell
- `client/src/context/WorkspaceContext.jsx` — optional: lưu shell snapshot

## File server

- `organization-service/src/routes/organizationRoutes.js`
- `organization-service/src/controllers/organizationController.js` — `getOrgShell`
- `api-gateway/src/config/permissions.js` — map route

## Tiêu chí hoàn thành

- [ ] Chọn org: 1 request shell thay 3
- [ ] Đổi org sidebar: invalidate + fetch shell mới
- [ ] Chat/voice channel list vẫn đúng ACL

## PR gợi ý

PR1 BE shell + cache. PR2 FE OrganizationsPage.
