---
name: wave-1a-react-query-client
overview: Sóng 1 — TanStack Query cho cache FE, giảm refetch sidebar và trang public.
todos:
  - id: install-query
    content: Thêm @tanstack/react-query + QueryClientProvider trong main.jsx
    status: completed
  - id: query-keys
    content: Định nghĩa query keys chuẩn (organizations, notifications, friends)
    status: completed
  - id: sidebar-migrate
    content: NavigationSidebar dùng useQuery thay useEffect + interval 60s badge
    status: completed
  - id: socket-invalidate
    content: Socket events invalidate query badge/notifications
    status: completed
  - id: dashboard-friends
    content: DashboardPage + FriendChatPage dùng shared queries
    status: completed
isProject: false
---

# Wave 1A — React Query (client)

**Sóng:** 1 — Public  
**Phụ thuộc:** [wave-0-observability.plan.md](./wave-0-observability.plan.md)  
**Tiếp theo:** [wave-1b-bootstrap-gateway.plan.md](./wave-1b-bootstrap-gateway.plan.md)  
**Giải quyết:** #5, hỗ trợ #4

> **Dev LAN:** Từ [wave-1b](./wave-1b-bootstrap-gateway.plan.md) trở đi bắt buộc `https://voicehub.local` — [\_lan-dev-preamble-snippet.md](./_lan-dev-preamble-snippet.md). Wave 1A: `QueryClient` + `api` base `/api` (đã có trong `client/.env`); không cấu hình `queryFn` trỏ `localhost:3000`.

## Mục tiêu

Component remount / chuyển trang không gọi lại API nếu dữ liệu còn fresh.

## File chính

- `client/package.json` — thêm dependency
- `client/src/main.jsx` — `QueryClientProvider`
- `client/src/lib/queryClient.js` (mới) — default `staleTime`, `gcTime`
- `client/src/hooks/queries/` (mới) — `useOrganizationsMy`, `useNotificationBadge`, `useFriendPending`
- `client/src/components/Layout/NavigationSidebar.jsx`
- `client/src/pages/Dashboard/DashboardPage.jsx`

## Cấu hình đề xuất

```js
staleTime: 30_000,      // badge, pending friends
staleTime: 120_000,     // organizations/my
gcTime: 10 * 60_000,
refetchOnWindowFocus: false, // tránh burst khi alt-tab
```

## Query keys

| Key | API |
|-----|-----|
| `['organizations','my']` | `GET /organizations/my` |
| `['notifications','badge', scope, orgId]` | `GET /notifications?limit=1&scope=...` |
| `['friends','pending']` | `GET /friends/pending` |

## Sidebar

- Thay `useEffect` + `setInterval(60000)` bằng `useQuery` + `refetchInterval` tùy chọn (hoặc chỉ socket invalidate).
- Khi `activeWorkspace` đổi → key org badge đổi theo `orgId`.

## Socket invalidate

Trong `SocketContext` hoặc listener sidebar: event notification read/new → `queryClient.invalidateQueries(['notifications','badge'])`.

## Tiêu chí hoàn thành

- [ ] Vào Dashboard rồi quay lại Friends — không duplicate `/organizations/my` trong 2 phút (staleTime)
- [ ] Badge vẫn đúng sau socket notification
- [ ] Không regression auth/landing embed guard

## PR gợi ý

1 PR: setup + sidebar. 1 PR: dashboard/friends.
