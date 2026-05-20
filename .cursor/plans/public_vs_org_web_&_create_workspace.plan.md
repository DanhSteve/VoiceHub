---
name: Public_vs_Org_Web_&_Create_Workspace
overview: Tách trải nghiệm thành Public Web và Workspace Web (tenant-scoped theo active workspace), đồng thời chuẩn hoá flow “Create Workspace Wizard” để backend tạo tenant hoàn chỉnh (organization + owner membership + role seed + default resources + validation + giới hạn số workspace), nhưng giữ nguyên naming/domain hiện tại là `org/organization` để tránh refactor diện rộng.
todos:
  - id: audit-current-org-create
    content: "Rà soát luồng hiện tại: `createOrganization` (tương đương create workspace), seed default structure, RBAC sync và nơi frontend đang set workspace context."
    status: completed
  - id: design-slug-status-quota
    content: Thiết kế schema `Workspace(Organization).slug/status/type/teamSize/industry` + indexes + reserved keywords + quota 3 workspace/user (backward-compatible).
    status: completed
  - id: api-update-create-workspace
    content: Cập nhật API create workspace để nhận slug + validation + quota; thêm API resolve workspace by slug (membership-guarded).
    status: completed
  - id: frontend-split-public-org
    content: Tổ chức lại router thành PublicLayout vs WorkspaceLayout; chuẩn hoá `/w/:slug/*` và activeWorkspace context (không dùng “activeOrg” trong UI).
    status: completed
  - id: create-workspace-wizard
    content: Implement Create Workspace Wizard 4 bước + handling lỗi validation/slug/limit.
    status: completed
  - id: phase-b-overview-notifs
    content: Thiết kế My Overview (read-only) + Global Notifications gắn nhãn workspace và redirect switch-org khi click item.
    status: completed
isProject: false
---

## Mục tiêu
- **Single Identity – Multi-Workspace**: user đăng nhập 1 lần, có thể thuộc nhiều workspace.
- **Tenant Isolation mặc định**: mọi dữ liệu task/channel/voice/doc/role luôn nằm trong **active workspace**.
- **Không trộn dữ liệu**: dashboard/workspace pages chỉ theo active workspace; chỉ có **My Overview** (read-only) và **Global Notifications** (global) được tổng hợp đa workspace.
- **Tách 2 chiều hướng**: Public Web (marketing/onboarding) vs Workspace Web (app làm việc theo workspace).
- **Tuân thủ constraint repo**: không thay đổi sâu auth/permission; mọi mở rộng phải backward-compatible.

## Quy ước naming giữ nguyên (Organization/Org)
Theo cập nhật mới, **không thực hiện rename diện rộng sang Workspace**. Toàn bộ naming kỹ thuật giữ nguyên:
- **API contract**: giữ `/api/organizations/*`
- **Tên service/folder/package/container**: giữ `organization-service`
- **Model/controller/route/field**: giữ `Organization`, `orgId`

Lưu ý: UI/UX vẫn có thể dùng từ “Workspace” để thân thiện với end-user, nhưng layer kỹ thuật và contract backend giữ `org` để giảm rủi ro regression.

## Phân vùng chức năng & dữ liệu (bắt buộc theo “chuẩn doanh nghiệp”)
### Vùng Global (theo user, không phụ thuộc workspace)
- **Profile cá nhân**
- **Friends (kết bạn)**
- **DM 1-1 + gọi 1-1** (chỉ với friends/allowed contacts)
- **Global Notifications**: tổng hợp thông báo từ mọi workspace; **mỗi item bắt buộc có nhãn workspace**
- **My Overview (read-only)**: tổng hợp “việc của tôi”/nhắc việc across workspace; click item → **tự chuyển workspace** rồi mở đúng màn chi tiết

### Vùng Tenant-specific (theo active workspace)
- **Workspace Dashboard**
- **Task/Project/Board**
- **Workspace settings / members / roles**
- **Channels / group chat**
- **Voice rooms / meetings nội bộ**
- **Tài liệu/Files nội bộ**

### Chuẩn UX “đúng doanh nghiệp”
- **Workspace Switcher cố định** (sidebar/top-left): luôn hiển thị workspace đang active + role của user trong workspace đó
- **Nhãn ngữ cảnh**: mọi màn hình có dữ liệu tenant phải hiển thị workspace name/icon rõ ràng
- **Không thao tác đa workspace trên một màn hình**: My Overview chỉ đọc; thao tác diễn ra sau khi chuyển đúng workspace
- **Empty State khi 0 workspace**: không để trắng; CTA Create Workspace + Join bằng link/mã

## Quy ước tách Public Web / Workspace Web (mặc định đề xuất)
Vì repo hiện có 1 frontend `client/` (Vite + React Router), chọn hướng ít rủi ro nhất:
- **1 app, 2 “shell” route** theo path:
  - Public Web: `/`, `/login`, `/register`, `/terms`, ...
  - Workspace Web: `/w/:slug/...` (ưu tiên slug cho UX)
- Lợi ích: không cần hạ tầng DNS/subdomain ngay; vẫn tách code theo folder/route group.

Nếu sau này muốn “chuẩn SaaS” hơn, có thể nâng cấp sang subdomain mà không đổi API logic (slug vẫn dùng được).

## Thiết kế dữ liệu & API cho Create Workspace Flow
### 1) Data model (Organization) + mở rộng wizard
Hiện `organization-service` đang sở hữu model `Organization` và route `POST /api/organizations` tạo org + membership + seed. Theo hướng mới:
- Giữ model `Organization`
- Membership giữ nguyên naming hiện tại

Flow tạo workspace vẫn giữ logic hiện tại:
- tạo `Organization` + `Membership(owner)`
- seed RBAC (`ensureDefaultOrgRoles` + `syncUserOrgRole`)
- seed structure (Department + Channel)

Sẽ mở rộng `Organization` (trong `services/organization-service/src/models/Organization.js`) để phục vụ wizard:
- `slug`: String, required, unique index, lowercase, trim
- `status`: enum `PENDING | ACTIVE | SUSPENDED | ARCHIVED` (mặc định `ACTIVE` cho dev; `PENDING` cho production có thể bật sau)
- `type`, `teamSize`, `industry` (optional) để phục vụ wizard
- `isActive` (giữ hoặc map) để tương thích luồng đang dùng filter active

`Membership` đã đủ (role/status). Không đổi auth.

### 2) Validation & giới hạn tạo workspace
Trong `createOrganization` (controller) sẽ thêm:
- **Validation**:
  - `name` min length
  - `slug` min length, pattern (a-z0-9-), normalize
  - `slug` unique
  - `slug` không thuộc reserved/blacklist: `admin, system, support, api, workspace, root, ...`
- **Quota**:
  - Mặc định: **tối đa 3 workspace / user** (đếm `Membership` role owner hoặc org ownerId)
  - Trả lỗi rõ ràng (409/422) khi vượt quota.

### 3) “Backend tạo tenant hoàn chỉnh” (đúng tinh thần Create Workspace)
Giữ nguyên những gì đã có và bổ sung “đủ-tối-thiểu”:
- `Organization`
- `Owner Membership` (đã có)
- `Default Roles` (đã có qua `ensureDefaultOrgRoles`)
- `Default Channels/Departments` (đã có qua `seedDefaultStructure`)
- `Default Workspace Settings`:
  - lưu vào `Organization.settings` (đã có schema), có thể set mặc định theo `organization type`.
- `Default Permissions`:
  - vì constraint “không đổi sâu permission”, chỉ **gọi lại flow seed role-permission hiện tại** (đã có). Không đổi contract.

### 4) API contract (giữ backward-compatible)
- Giữ endpoint chính:
  - `POST /api/organizations` (create workspace/org)
  - `GET /api/organizations/my` (list my workspaces/orgs)
  - `GET /api/organizations/by-slug/:slug`
  - `GET /api/organizations/:id` (guard membership)
- Giữ `api-gateway` route mapping hiện tại theo `/organizations`.
- Chỉ mở rộng payload/validation cần thiết, không đổi path contract public.

## Frontend plan: tách Public Web vs Workspace Web
Trong `client/src` (React Router):
- Tạo 2 layout:
  - `PublicLayout`: marketing + auth flows
  - `WorkspaceLayout`: shell app nội bộ, bắt buộc có active workspace
- Routing đề xuất:
  - Public: `/`, `/login`, `/register`, `/verify-email`, ...
  - Workspace: `/w/:slug/dashboard`, `/w/:slug/channels/:channelId`, `/w/:slug/voice/:roomId`, `/w/:slug/tasks`, ...
- “Active workspace context”:
  - Khi vào `/w/:slug/*`, client fetch workspace by slug + myRole, set `activeWorkspace` trong context/store.
  - Mọi API tenant-scoped map về `orgId` theo contract hiện tại.

## Onboarding khi 0/1/>1 workspace
- 0 workspace: trang `Organizations` (hoặc label UI “Workspaces” nếu cần) hiển thị Empty State + CTA:
  - **Create Workspace** (wizard)
  - Join bằng link/mã (đã có flows invitations/join-applications)
- 1 workspace: auto redirect `/w/:slug/dashboard`.
- >1 workspace: có Workspace Switcher (sidebar), default vào last active (lưu localStorage).

## Create Workspace Wizard (UI)
Wizard 4 bước (đúng yêu cầu):
- Step 1: Workspace name
- Step 2: Workspace slug URL (preview `workspace.domain.com/<slug>` hoặc `domain.com/w/<slug>`)
- Step 3: Workspace type + team size + industry (optional)
- Step 4: Submit → backend tạo xong → redirect vào workspace + màn “Invite Members” (tuỳ làm sau)

## My Overview + Global Notifications (đúng nguyên tắc vàng)
- My Overview: read-only, tổng hợp task/nhắc việc/notification; mỗi item có nhãn workspace; click item → auto switch sang workspace rồi mở chi tiết.
- Global Notifications: hiển thị cross-workspace, item luôn có `workspaceName/workspaceSlug` (hoặc map từ `orgName/orgSlug` ở payload hiện có).

## Rủi ro & khoá cứng
- Không tạo endpoint tenant-scoped trả multi-workspace data (trừ My Overview/Notifications và phải gắn nhãn workspace).
- Role theo workspace: UI hiển thị rõ role theo active workspace.
- Telemetry tối thiểu: log `workspace_created`, `workspace_switched`, `invite_accepted` (nếu đã có infra log).

## Ước lượng effort (để cân credit)
- **Phase B**: My Overview (read-only) + Global Notifications gắn nhãn workspace. (M)
- **Phase C**: Verified org tier + trạng thái PENDING/ACTIVE enforcement + admin review. (L)

## Plan theo phase (file riêng)
- Phase B: `[.cursor/plans/phase-b_overview_notifications.plan.md](.cursor/plans/phase-b_overview_notifications.plan.md)`
- Phase C: `[.cursor/plans/phase-c_verified_workspaces.plan.md](.cursor/plans/phase-c_verified_workspaces.plan.md)`
