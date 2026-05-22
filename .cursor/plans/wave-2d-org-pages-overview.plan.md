---
name: wave-2d-org-pages-overview
overview: Sóng 2 — Aggregate từng màn org (workspace chat, documents, notifications org) thay N request song song.
todos:
  - id: workspace-overview
    content: Giảm loader OrganizationsPage (invitations gộp hoặc lazy)
    status: completed
  - id: documents-overview
    content: GET organizations/:id/documents-overview thay 4 parallel trong useOrganizationDocuments
    status: completed
  - id: notifications-org
    content: Notifications org dùng shell badge + list before/nextBefore
    status: completed
  - id: member-sidebar
    content: Gộp members + roles một call hoặc cache shell
    status: completed
isProject: false
---

# Wave 2D — Org pages overview (theo màn)

**Sóng:** 2 — Org  
**Phụ thuộc:** [wave-2a-org-shell.plan.md](./wave-2a-org-shell.plan.md)  
**Song song:** [wave-2e-cursor-pagination-dto.plan.md](./wave-2e-cursor-pagination-dto.plan.md)  
**Giải quyết:** #1, #6

## Tiền đề — Dev `https://voicehub.local`

> Checklist chung: [_lan-dev-preamble-snippet.md](./_lan-dev-preamble-snippet.md) · [docs/lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md)

### Riêng wave 2D (org pages)

- `GET /messages?organizationId=...` và documents search: **relative `/api`** qua Nginx.
- Upload file org (nếu có): `FormData` + `resolveMediaUrl`; Firebase CORS có `https://voicehub.local` khi đụng storage.
- Verify: `https://voicehub.local/w/<slug>` — load messages/documents từ **máy LAN**, không chỉ localhost.

## Thứ tự build trong plan

1. Workspace chat (`OrganizationsPage`)
2. Documents org
3. Notifications org
4. Member sidebar / search panel

---

## 1. Workspace chat

**Hiện trạng mount:** `Promise.all` 4 loaders + `loadChatContacts` + shell (sau 2a).

**Tối ưu:**

- Invitations / join applications: **lazy** — chỉ fetch khi mở modal hoặc tab "Lời mời".
- `loadChatContacts`: dùng `friends` từ query cache public.
- Members panel: defer đến khi mở sidebar phải.

**File:** `OrganizationsPage.jsx`, `OrganizationMemberSidebar.jsx`

---

## 2. Documents org (ưu tiên cao — nặng nhất)

**Hiện trạng** (`useOrganizationDocuments.js`):

- `GET structure` + `GET org` + `GET messages/search` (8×50) + `GET documents`

**Mục tiêu:** `GET /organizations/:orgId/documents-overview`

Response gợi ý:

```json
{
  "orgName": "",
  "categories": { "channel_chat": 12, "library": 3 },
  "files": [{ "id", "name", "category", "url", "createdAt", "source" }],
  "hasMore": false,
  "nextPageToken": null
}
```

BE: chat-service internal hoặc org-service orchestrate — **không** trả 400 message full client-side.

**FE:** hook mới `useOrganizationDocumentsOverview` — 1 query.

---

## 3. Notifications org

- Badge từ org shell.
- List: `scope=organization&organizationId=` + `before` / `nextBefore` (load-more).
- Route: `/notifications/organization` — đã tách; chỉ giảm request.

---

## 4. Member sidebar

- `Promise.all(members, roles)` → một endpoint `GET .../members-with-roles` **hoặc** cache roles 5 phút (ít đổi).

---

## Tiêu chí hoàn thành

- [ ] Documents org: ≤2 request initial (shell đã có + overview)
- [ ] OrganizationsPage mount giảm ≥40% request vs baseline wave-0

## PR gợi ý

Mỗi màn 1 PR (documents trước).
