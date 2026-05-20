import apiClient from './apiClient';

/* ========================================
   ROLEAPI.JS - ROLE & PERMISSION MANAGEMENT API
   Quản lý vai trò (roles) trong organization/server
   Liên kết với: role-permission-service (port 3015)
======================================== */

export const roleAPI = {
  /* ----- GET ROLES BY ORGANIZATION -----
     Lấy danh sách tất cả roles trong organization
     Query: GET /roles?organizationId={orgId}
     Return: [{ id, name, permissions, members, color, icon, ... }]
  */
  getRolesByOrganization: (organizationId) => {
    const id = encodeURIComponent(organizationId);
    // Backend: GET /api/roles/server/:serverId (organizationId thường trùng server context)
    return apiClient.get(`/roles/server/${id}`);
  },

  /* ----- GET ROLES BY SERVER -----
     Lấy danh sách roles trong 1 server cụ thể
     Query: GET /servers/{serverId}/roles
     Return: [{ id, name, permissions, members, color, icon, ... }]
  */
  getRolesByServer: (serverId) => {
    return apiClient.get(`/servers/${serverId}/roles`);
  },

  /* ----- GET ROLE BY ID -----
     Lấy chi tiết 1 role
     Query: GET /roles/{roleId}
     Return: { id, name, permissions, members, color, icon, ... }
  */
  getRole: (roleId) => {
    return apiClient.get(`/roles/${roleId}`);
  },

  /* ----- CREATE ROLE -----
     Tạo vai trò mới
     POST: /roles
     Body: { name, serverId/organizationId, permissions, color, icon }
     Return: { id, name, permissions, members: 0, color, icon, ... }
  */
  createRole: (roleData) => {
    return apiClient.post('/roles', roleData);
  },

  /* ----- UPDATE ROLE -----
     Cập nhật thông tin role
     PATCH: /roles/{roleId}
     Body: { name, permissions, color, icon, ... }
     Return: { id, name, permissions, members, color, icon, ... }
  */
  updateRole: (roleId, updates) => {
    return apiClient.patch(`/roles/${roleId}`, updates);
  },

  /* ----- DELETE ROLE -----
     Xóa vai trò
     DELETE: /roles/{roleId}
     Return: { success: true }
  */
  deleteRole: (roleId) => {
    return apiClient.delete(`/roles/${roleId}`);
  },

  /* ----- ASSIGN ROLE TO USER -----
     Gán role cho user
     POST: /roles/assign
     Body: { roleId, userId, serverId }
     Return: { success: true, userRole: { ... } }
  */
  assignRoleToUser: (roleId, userId, serverId) => {
    return apiClient.post('/roles/assign', { roleId, userId, serverId });
  },

  /* ----- REMOVE ROLE FROM USER -----
     Gỡ role khỏi user
     POST: /roles/remove
     Body: { roleId, userId, serverId }
     Return: { success: true }
  */
  removeRoleFromUser: (roleId, userId, serverId) => {
    return apiClient.post('/roles/remove', { roleId, userId, serverId });
  },

  /* ----- GET USER ROLES IN SERVER -----
     Lấy danh sách role của 1 user trong server
     GET: /roles/user/{userId}/server/{serverId}
     Return: [{ roleId, ... }] hoặc [{ id/_id, ... }]
  */
  getUserRoles: (userId, serverId) => {
    return apiClient.get(`/roles/user/${encodeURIComponent(userId)}/server/${encodeURIComponent(serverId)}`);
  }
};

export default roleAPI;
