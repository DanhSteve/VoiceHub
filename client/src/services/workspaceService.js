/* ========================================
   ORGANIZATIONSERVICE.JS - ORGANIZATION API
   Quản lý organizations, departments, teams, members
   Kết nối: organization-service (port 4003)
   
   Cấu trúc:
   Organization (Công ty)
   └─ Departments (Phòng ban)
      └─ Teams (Nhóm)
         └─ Members (Thành viên)
======================================== */
import api from './api';

const organizationService = {
  /* ===== ORGANIZATION CRUD ===== */
  
  // Lấy workspaces của user hiện tại - GET /workspaces/my
  getMyOrganizations: async () => {
    return await api.get('/workspaces/my');
  },

  // Lấy chi tiết org - GET /organizations/:id
  getOrganization: async (id) => {
    return await api.get(`/workspaces/${id}`);
  },

  // Tạo org mới - POST /organizations
  // data: { name, description, logo, ... }
  createOrganization: async (data) => {
    return await api.post('/workspaces', data);
  },

  // Cập nhật org - PUT /organizations/:id
  updateOrganization: async (id, data) => {
    return await api.put(`/workspaces/${id}`, data);
  },

  // Xóa org - DELETE /organizations/:id
  // Chỉ owner mới xóa được
  deleteOrganization: async (id) => {
    return await api.delete(`/workspaces/${id}`);
  },

  /* ===== DEPARTMENTS ===== */
  
  // Lấy departments - GET /organizations/:orgId/departments
  getDepartments: async (orgId) => {
    return await api.get(`/workspaces/${orgId}/departments`);
  },

  // Tạo department - POST /organizations/:orgId/departments
  // data: { name, description, managerId }
  createDepartment: async (orgId, data) => {
    return await api.post(`/workspaces/${orgId}/departments`, data);
  },

  /* ===== TEAMS ===== */
  
  // Lấy teams trong department
  getTeams: async (orgId, departmentId) => {
    return await api.get(`/workspaces/${orgId}/departments/${departmentId}/teams`);
  },

  // Tạo team - data: { name, leaderId, members }
  createTeam: async (orgId, departmentId, data) => {
    return await api.post(`/workspaces/${orgId}/departments/${departmentId}/teams`, data);
  },

  /* ===== MEMBERS MANAGEMENT ===== */
  
  // Mời thành viên - POST /organizations/:orgId/members/invite
  // userId: id của người dùng cần mời
  // role: 'owner' | 'admin' | 'member'
  inviteMember: async (orgId, userId, role = 'member') => {
    return await api.post(`/workspaces/${orgId}/members/invite`, { userId, role });
  },

  // Lấy danh sách members - GET /organizations/:orgId/members
  getMembers: async (orgId) => {
    return await api.get(`/workspaces/${orgId}/members`);
  },

  // Cập nhật role - PUT /organizations/:orgId/members/:userId/role
  // role: thay đổi từ member → admin, etc.
  updateMemberRole: async (orgId, userId, role) => {
    return await api.put(`/workspaces/${orgId}/members/${userId}/role`, { role });
  },

  // Xóa member - DELETE /organizations/:orgId/members/:userId
  removeMember: async (orgId, userId) => {
    return await api.delete(`/workspaces/${orgId}/members/${userId}`);
  },
};

export default organizationService;
