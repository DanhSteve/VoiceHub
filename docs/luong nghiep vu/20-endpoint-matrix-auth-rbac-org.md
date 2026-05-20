# Endpoint Matrix - Auth / RBAC / Organization

Ma trận này ưu tiên endpoint cốt lõi dùng trong luồng nghiệp vụ chính, đối chiếu từ gateway và service routes.

## 1) Auth

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| POST | `/api/auth/register` | Gateway public-route bypass permission | `auth.controller.register` | `UserAuth` (Mongo) | `400` invalid input, `409` email existed |
| GET | `/api/auth/verify-email` | Gateway public-route | `auth.controller.verifyEmail` | `UserAuth` | `400/410` token invalid/expired |
| POST | `/api/auth/login` | Gateway public-route | `auth.controller.login` | `UserAuth`, Redis refresh token | `401` invalid credentials, `423` account locked |
| POST | `/api/auth/refresh-token` | Gateway public-route | `auth.controller.refreshToken` | Redis + `UserAuth` | `401` invalid refresh token |
| POST | `/api/auth/forgot-password` | Gateway public-route | `auth.controller.forgotPassword` | `UserAuth` | `200` generic response (anti-enumeration) |
| POST | `/api/auth/reset-password` | Gateway public-route | `auth.controller.resetPassword` | `UserAuth` | `400` invalid token/password |
| POST | `/api/auth/logout` | Gateway auth middleware | `auth.controller.logout` | Redis refresh token | `401` unauthorized |
| GET | `/api/auth/me` | Gateway auth middleware | `auth.controller.me` | JWT claims + `UserAuth` | `401` unauthorized |

## 2) RBAC / Permission

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| POST | `/api/permissions/check` | `internalGatewayAuth` (role-permission-service) | `permission.controller.checkPermission` | `UserRole`, `Role`, Redis permission cache | `401/403` internal token invalid, `400` missing context |
| GET | `/api/permissions/user/:userId/server/:serverId` | `authenticateOrInternal` | `permission.controller.getUserPermissions` | `UserRole`, `Role` | `404` no role mapping |
| GET | `/api/permissions/user/:userId/server/:serverId/role` | `authenticateOrInternal` | `permission.controller.getUserRole` | `UserRole`, `Role` | `404` role not found |
| POST | `/api/roles` | Gateway auth + permission route mapping | `role.controller.createRole` | `Role` | `400/409` invalid/duplicate role |
| PATCH/PUT | `/api/roles/:roleId` | Gateway auth + permission | `role.controller.updateRole` | `Role` | `404` role not found |
| DELETE | `/api/roles/:roleId` | Gateway auth + permission | `role.controller.deleteRole` | `Role`, `UserRole` | `404` role not found |
| POST | `/api/roles/assign` | Gateway auth + permission | `role.controller.assignRole` | `UserRole` | `400` invalid payload, `409` duplicate assignment |
| POST | `/api/roles/remove` | Gateway auth + permission | `role.controller.removeRole` | `UserRole` | `404` mapping not found |

## 3) Organization + Membership

| Method | Path | Middleware chính | Controller/Handler | Model/Storage | Exception thường gặp |
|---|---|---|---|---|---|
| POST | `/api/organizations` | Gateway auth -> org `protect` | `organizationController.createOrganization` | `Organization`, `Membership`, `Department`, `Channel` | `400` invalid payload |
| GET | `/api/organizations/my` | Gateway auth -> org `protect` | `organizationController.getMyOrganizations` | `Membership`, `Organization` | `401` unauthorized |
| GET | `/api/organizations/:id` | Gateway auth -> org `protect` | `organizationController.getOrganizationById` | `Organization`, `Membership` | `403/404` no access/not found |
| PUT | `/api/organizations/:id` | Gateway auth -> org `protect + authorize(owner/admin)` | `organizationController.updateOrganization` | `Organization` | `403` forbidden, `404` not found |
| DELETE | `/api/organizations/:id` | Gateway auth -> org `protect` | `organizationController.deleteOrganization` | Cascade purge + `Organization` | `403` only owner, `5xx` downstream purge fail |
| GET | `/api/organizations/:orgId/members` | Gateway auth -> org `protect` | `memberController.getMembers` | `Membership` | `403` forbidden |
| POST | `/api/organizations/:orgId/members` | Gateway auth -> org `protect + authorize(owner/admin)` | `memberController.inviteMember` | `Membership` | `409` already active member |
| POST | `/api/organizations/:orgId/members/leave` | Gateway auth -> org `protect` | `memberController.leaveOrganization` | `Membership` | `400` owner duy nhất không được leave |
| PUT | `/api/organizations/:orgId/members/:userId/role` | Gateway auth -> org `protect + authorize(owner/admin)` | `memberController.updateMemberRole` | `Membership` + role sync | `403/404` |
| DELETE | `/api/organizations/:orgId/members/:userId` | Gateway auth -> org `protect + authorize(owner/admin)` | `memberController.removeMember` | `Membership` | `403/404` |
| POST | `/api/organizations/:orgId/join-applications` | Gateway auth -> org `protect` | `joinApplicationController.submitApplication` | `JoinApplication` | `409` duplicate pending |
| POST | `/api/organizations/:orgId/join-applications/:id/approve` | Gateway auth -> org `protect + authorize(owner/admin)` | `joinApplicationController.approveApplication` | `JoinApplication`, `Membership` | `403/404/409` |

## 4) Gateway action-level check (tham chiếu chung)

| Layer | Logic | Ghi chú |
|---|---|---|
| API Gateway `auth.middleware` | Verify JWT và set `req.user` | Route public bỏ qua auth |
| API Gateway `permission.middleware` | Map action theo method+path, gọi `/api/permissions/check` | Có `noPermissionRoutes` có chủ đích |
| Role/Permission service | Tính quyền từ `UserRole` + `Role` và cache Redis | Lỗi check -> gateway fail-closed |
