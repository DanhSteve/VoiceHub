---
name: wave-1c-public-pages-optimize
overview: Sóng 1 — Gom/giảm request trang public (Dashboard, Friends, Notifications cá nhân, Calendar).
todos:
  - id: dashboard-summary
    content: Mở rộng hoặc aggregate GET dashboard data (BE) + FE query cache
    status: completed
  - id: dedupe-org-list
    content: Bỏ GET /organizations/my trùng giữa Dashboard và Sidebar (dùng query cache)
    status: completed
  - id: notifications-cursor
    content: NotificationsPage personal — before/nextBefore pagination (phối hợp 2e)
    status: completed
  - id: friend-chat-messages
    content: FriendChatPage messages — stale cache + pageToken load more
    status: completed
isProject: false
---

# Wave 1C — Public pages optimize

**Sóng:** 1 — Public  
**Phụ thuộc:** [wave-1b-bootstrap-gateway.plan.md](./wave-1b-bootstrap-gateway.plan.md)  
**Tiếp theo:** [wave-2b-redis-acl-cache.plan.md](./wave-2b-redis-acl-cache.plan.md)  
**Giải quyết:** #1, #6 (public scope)

## Tiền đề — Dev `https://voicehub.local`

> Checklist chung: [_lan-dev-preamble-snippet.md](./_lan-dev-preamble-snippet.md) · [docs/lan-https-voicehub.local.md](../../docs/lan-https-voicehub.local.md)

### Riêng wave 1C (public pages)

- Mọi `useQuery` / `api.get` trên Dashboard, FriendChat, Notifications: **relative `/api`** — không host cố định trong `queryFn`.
- Sidebar/Dashboard: cache bootstrap — không gọi lại `organizations/my` bằng URL absolute.
- Avatar preview: `resolveMediaUrl('/uploads/...')`.
- Kiểm thử: `https://voicehub.local/dashboard`, `/chat/friends` trên **máy LAN** (file `hosts`), không chỉ `:5173` trên máy dev.

## Mục tiêu

Sau bootstrap + React Query, tối ưu từng màn **không** `organizationId` — không đụng org workspace sâu.

## Dashboard (`DashboardPage.jsx`)

**Hiện trạng:** mount nhiều API: organizations, friends, pending, notifications, meetings, tasks stats.

**Hướng:**

1. **Ngắn hạn (chỉ FE):** dùng query cache từ bootstrap + `useQuery` shared — không gọi lại org list.
2. **Trung hạn (BE):** `GET /api/users/me/dashboard-summary` trên **user-service** hoặc handler mở rộng — gộp counts (tasks due, unread notif, pending friends) **không** full list.

Ưu tiên (1) nếu đủ metrics; (2) khi baseline dashboard vẫn >6 request.

## Friends / DM

- `FriendChatPage` / `FriendChatRightPanel`: cache `GET /friends` theo user.
- Messages: chuẩn bị pageToken (chi tiết [wave-2e](./wave-2e-cursor-pagination-dto.plan.md)) — DM có thể dùng `before=` tạm hoặc `pageToken`.

## Notifications public (`/notifications`)

- List: `limit=20` + `before` / `nextBefore`.
- Badge đã từ bootstrap/query — list page không refetch badge trừ invalidate.

## Calendar / Voice public routes

- Chỉ audit Network tab; gộp nếu có 2+ GET cùng resource khi mount.

## Tiêu chí hoàn thành

- [ ] Dashboard mount ≤4 request (sau bootstrap) so với baseline wave-0
- [ ] Không regression landing demo / embed guard

## PR gợi ý

1 PR FE dedupe. 1 PR BE dashboard-summary (tùy chọn).
