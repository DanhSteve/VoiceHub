---
name: wave-0-observability
overview: Tiền đề trước Sóng 1 — đo latency/request, chuẩn pagination contract, audit populate/index Mongo.
todos:
  - id: metrics-baseline
    content: Ghi baseline số request và p95 theo màn (boot, dashboard, org workspace, documents org)
    status: completed
  - id: pagination-contract
    content: Document chuẩn pageToken/before + limit + fields=summary cho API đọc nhiều
    status: completed
  - id: populate-audit
    content: Rà populate User/model chưa đăng ký gây 500 hoặc chậm
    status: completed
  - id: mongo-indexes
    content: Thêm index hot path (organizationId+createdAt, roomId+createdAt, userId+isRead)
    status: completed
isProject: false
---

# Wave 0 — Observability & nền tảng DB

**Sóng:** Tiền đề (1–2 tuần)  
**Phụ thuộc:** Không  
**Tiếp theo:** [wave-1a-react-query-client.plan.md](./wave-1a-react-query-client.plan.md)  
**Giải quyết vấn đề:** #6 (một phần), #7

## Mục tiêu

Có số đo trước/sau; tránh tối ưu mù. Chuẩn hóa contract để Sóng 2e implement pageToken / before nhất quán (không đặt tên `cursor` trong JSON).

## Việc cần làm

### 1. Baseline metrics

Đo trên môi trường dev/staging (Chrome Network hoặc log gateway):

| Màn | Endpoint ước lượng | Ghi chú |
|-----|-------------------|---------|
| App boot + sidebar | `/auth/me`, `/users/me`, `/friends/pending`, `/notifications`, `/organizations/my` | Trùng giữa các trang |
| Dashboard | org list, friends, notifications, tasks, meetings | `DashboardPage.jsx` |
| Org workspace | 4 loader + structure + ACL + task scope + members | `OrganizationsPage.jsx` |
| Org documents | structure + org + search×N + documents | `useOrganizationDocuments.js` |

Lưu file `docs/perf-baseline-YYYY-MM.md` (hoặc comment trong PR đầu Sóng 1).

### 2. Chuẩn API đọc nhiều

- `limit` mặc định 20–50, max 100.
- `pageToken` = `{ createdAt, _id }` encode base64url; notifications: `before` / `nextBefore` (ISO).
- `fields=summary|full` — summary không populate sâu.

Áp dụng dần ở: `GET /messages`, `GET /notifications`, `GET /messages/search`.

### 3. Audit populate

- Tìm `.populate('user'|'sender'|...)` trong chat, document, notification.
- Model `User` chưa register trong service → bỏ populate, lean, hoặc denormalize field hiển thị.

### 4. Index Mongo

Ưu tiên compound index (không block production — chạy background):

- Messages: `{ organizationId: 1, createdAt: -1 }`, `{ roomId: 1, createdAt: -1 }`
- Notifications: `{ userId: 1, scope: 1, isRead: 1, createdAt: -1 }`

## Tiêu chí hoàn thành

- [ ] Bảng baseline có số request + p95 ít nhất 4 màn
- [ ] Spec pagination (`docs/api-read-pagination-contract.md`) ghi trong docs hoặc README service
- [ ] Không còn populate gây 500 trên path hot
- [ ] Index tạo xong trên DB dev

## Rủi ro

- Index sai thứ tự field → explain plan trước khi deploy prod.
