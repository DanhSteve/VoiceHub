# Performance baseline — VoiceHub (2026-05)

> **Mục đích:** Số đo trước Sóng 1–3 (React Query, bootstrap, org shell).  
> **Cách đo:** DevTools → Network, filter `Fetch/XHR`, đăng nhập, hard refresh (Ctrl+Shift+R), ghi **số request** và **p95** (cột Timing → chờ phản hồi hoàn tất).

## Môi trường ghi nhận

| Mục | Giá trị |
|-----|---------|
| Ngày | 2026-05-21 |
| Nguồn inventory | Rà soát code client (chưa chạy browser tự động) |
| API prefix | `/api` → API Gateway |
| Ghi chú | Cột **p95 đo thực tế** cần điền sau khi chạy local/staging |

## 1. App boot + sidebar (mọi trang protected)

**Luồng:** `AuthContext` mount → `NavigationSidebar` mount (song song).

| # | Method | Endpoint | File gọi | p95 (ms) |
|---|--------|----------|----------|----------|
| 1 | GET | `/api/auth/me` | `authService.getCurrentUser` | _điền_ |
| 2 | GET | `/api/users/me` | `authService` (optional) | _điền_ |
| 3 | GET | `/api/organizations/my` | `NavigationSidebar` | _điền_ |
| 4 | GET | `/api/friends/pending` | `NavigationSidebar` (rail cá nhân) | _điền_ |
| 5 | GET | `/api/notifications?scope=personal&limit=1` | `NavigationSidebar` badge | _điền_ |

**Rail tổ chức** (`/w/*`, `/notifications/organization`): bỏ #4; notifications dùng `scope=organization&organizationId=...&limit=1`.

**Tổng request ước tính (cá nhân):** 4–5 (+ Socket.IO, không REST).

**Trùng lặp:** `GET /organizations/my` lặp lại trên Dashboard và OrganizationsPage nếu không có cache FE.

---

## 2. Dashboard (`/dashboard`)

**File:** `client/src/pages/Dashboard/DashboardPage.jsx`

| # | Endpoint | Ghi chú |
|---|----------|---------|
| 1 | `GET /organizations/my` | Trùng sidebar |
| 2 | `GET /friends` | Danh sách bạn |
| 3 | `GET /friends/pending` | Trùng sidebar |
| 4 | `GET /notifications` | List/badge |
| 5 | `GET /messages` (loop page 1..40, limit 100) | Sparkline / heatmap — **nặng** |
| 6 | `GET /tasks` (loop page 1..25) | Thống kê |
| 7 | `GET /tasks/statistics` × N org | `sumTaskDoneAcrossOrgs` — 1 call/org |
| 8+ | Meetings API | `meetingAPI` |

**Tổng REST ước tính:** 8 + số org (statistics) + tới **65** message pages + **25** task pages trong worst case.

**Mục tiêu Sóng 1c:** ≤4 request initial sau bootstrap; không paginate toàn bộ messages/tasks trên mount.

---

## 3. Org workspace (`OrganizationsPage` — `/workspaces`, `/w/:slug`)

**Mount (`Promise.all`):**

| Endpoint |
|----------|
| `GET /organizations/my` |
| `GET /organizations/invitations` |
| `GET /organizations/my/pending-join-applications` |
| `GET /organizations/my/join-applications-to-review` |

**Thêm:** `GET /friends` + `GET /organizations/:orgId/members` (`loadChatContacts`).

**Khi chọn org (`selectedOrganizationId`):**

| Endpoint |
|----------|
| `GET /organizations/:orgId/structure` |
| `GET /organizations/:orgId/accessible-channel-ids` |
| `GET /organizations/:orgId/task-workspace-scope` |
| `GET /tasks?organizationId=...` |

**Khi mở member sidebar:** `GET /organizations/:orgId/members` + `GET /roles/server/:orgId`.

**Tổng REST ước tính (lần đầu vào org):** 10–14 (+ messages theo channel).

**Mục tiêu Sóng 2a:** 1× `GET /organizations/:orgId/shell` thay 3 call structure/ACL/task-scope.

---

## 4. Org documents (`/documents?organizationId=...`)

**File:** `useOrganizationDocuments.js` — `Promise.all` 4 nhánh:

| # | Endpoint | Ghi chú |
|---|----------|---------|
| 1 | `GET /organizations/:id/structure` | |
| 2 | `GET /organizations/:id` | |
| 3 | `GET /messages/search?hasAttachment=true` | Tối đa **8 trang × 50** = 400 tin |
| 4 | `GET /documents?organizationId&limit=100` | |

**Phía server (search):** chat-service gọi thêm `GET /organizations/:id/accessible-channel-ids` (S2S) mỗi search.

**Tổng REST client:** 4 + (1–8) search pages.  
**Tổng gateway→org (search):** +1 S2S mỗi trang search.

**Mục tiêu Sóng 2d:** 1× `documents-overview` + shell cache.

---

## 5. Gateway & JWT

Mỗi REST qua gateway: 1× JWT verify + (thường) 1× permission check (trừ route trong `noPermissionRoutes`).

Tham chiếu: `docs/OBSERVABILITY.md`, `api-gateway/src/middlewares/permission.middleware.js`.

---

## 6. Chỉ số mục tiêu (sau các sóng)

| Màn | Hiện tại (ước tính) | Mục tiêu |
|-----|---------------------|----------|
| Boot shell | 4–5 | 2 (`/auth/me` + `/bootstrap`) |
| Dashboard initial | 8–70+ | ≤4 |
| Chọn org | +3 | +1 shell |
| Org documents | 4–12 | ≤2 |

---

## Cách cập nhật baseline

1. Chạy stack local (`docker-compose` hoặc `npm` từng service).
2. Đăng nhập user test có ≥2 org.
3. Ghi p95 từng endpoint vào bảng trên.
4. Commit file này khi thay đổi kiến trúc load (sau mỗi sóng).
