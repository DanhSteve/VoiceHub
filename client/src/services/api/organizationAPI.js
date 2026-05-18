import apiClient from './apiClient';

export const organizationAPI = {
  // Get all organizations
  getOrganizations: async () => {
    const response = await apiClient.get('/organizations/my');
    return response;
  },

  /** Đơn gia nhập đang chờ duyệt của user (sidebar). */
  getMyPendingJoinApplications: async () => {
    const response = await apiClient.get('/organizations/my/pending-join-applications');
    return response;
  },

  /** Đơn gia nhập cần duyệt (owner/admin), gom cho Trang chủ tổ chức. */
  getJoinApplicationsToReview: async () => {
    const response = await apiClient.get('/organizations/my/join-applications-to-review');
    return response;
  },

  // Get single organization
  getOrganization: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}`);
    return response;
  },

  // Create organization
  createOrganization: async (data) => {
    const response = await apiClient.post('/organizations', data);
    return response;
  },

  createWorkspace: async (data) => {
    const response = await apiClient.post('/organizations', data);
    return response;
  },

  getStructure: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/structure`);
    return response;
  },

  getBranches: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/hierarchy/branches`);
    return response;
  },

  createBranch: async (orgId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/hierarchy/branches`, data);
    return response;
  },

  getDivisions: async (orgId, branchId) => {
    const response = await apiClient.get(`/organizations/${orgId}/hierarchy/branches/${branchId}/divisions`);
    return response;
  },

  createDivision: async (orgId, branchId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/hierarchy/branches/${branchId}/divisions`, data);
    return response;
  },
  updateDivision: async (orgId, divisionId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/hierarchy/divisions/${divisionId}`, data);
    return response;
  },

  getDepartmentsByDivision: async (orgId, divisionId) => {
    const response = await apiClient.get(`/organizations/${orgId}/hierarchy/divisions/${divisionId}/departments`);
    return response;
  },

  createDepartmentByDivision: async (orgId, divisionId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/hierarchy/divisions/${divisionId}/departments`, data);
    return response;
  },

  getTeamsByDepartment: async (orgId, deptId) => {
    const response = await apiClient.get(`/organizations/${orgId}/hierarchy/departments/${deptId}/teams`);
    return response;
  },

  createTeamByDepartment: async (orgId, deptId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/hierarchy/departments/${deptId}/teams`, data);
    return response;
  },
  updateTeamByHierarchy: async (orgId, teamId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/hierarchy/teams/${teamId}`, data);
    return response;
  },

  getChannelsByTeam: async (orgId, teamId) => {
    const response = await apiClient.get(`/organizations/${orgId}/hierarchy/teams/${teamId}/channels`);
    return response;
  },

  createChannelByTeam: async (orgId, teamId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/hierarchy/teams/${teamId}/channels`, data);
    return response;
  },
  createChannelByScope: async (orgId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/hierarchy/channels`, data);
    return response;
  },
  updateChannelByTeam: async (orgId, teamId, channelId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/hierarchy/teams/${teamId}/channels/${channelId}`, data);
    return response;
  },
  updateChannelByScope: async (orgId, channelId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/hierarchy/channels/${channelId}`, data);
    return response;
  },

  getWorkspaceBySlug: async (slug) => {
    const response = await apiClient.get(`/organizations/by-slug/${encodeURIComponent(slug)}`);
    return response;
  },
  getAccessibleChannelIds: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/accessible-channel-ids`);
    return response;
  },

  getTaskWorkspaceScope: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/task-workspace-scope`);
    return response;
  },
  listChannelAccess: async (orgId, channelId) => {
    const response = await apiClient.get(`/organizations/${orgId}/channels/${channelId}/access`);
    return response;
  },
  grantChannelAccess: async (orgId, channelId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/channels/${channelId}/access/grant`, data);
    return response;
  },
  revokeChannelAccess: async (orgId, channelId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/channels/${channelId}/access/revoke`, data);
    return response;
  },
  listChannelRoleAccess: async (orgId, channelId) => {
    const response = await apiClient.get(
      `/organizations/${orgId}/channels/${channelId}/role-access`
    );
    return response;
  },
  saveChannelRoleAccess: async (orgId, channelId, data) => {
    const response = await apiClient.put(
      `/organizations/${orgId}/channels/${channelId}/role-access`,
      data
    );
    return response;
  },

  // Get pending invitations for current user
  getMyInvitations: async () => {
    const response = await apiClient.get('/organizations/invitations');
    return response;
  },

  // Respond invitation (accept/reject)
  respondInvitation: async (invitationId, action) => {
    const response = await apiClient.post(`/organizations/invitations/${invitationId}/respond`, { action });
    return response;
  },

  // Update organization
  updateOrganization: async (orgId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}`, data);
    return response;
  },

  // Delete organization
  deleteOrganization: async (orgId) => {
    const response = await apiClient.delete(`/organizations/${orgId}`);
    return response;
  },

  // Get organization members
  getMembers: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/members`);
    return response;
  },

  // Add member to organization
  addMember: async (orgId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/members`, data);
    return response;
  },

  // Update member role
  updateMemberRole: async (orgId, userId, role) => {
    const response = await apiClient.put(`/organizations/${orgId}/members/${userId}/role`, { role });
    return response;
  },

  // Remove member from organization
  removeMember: async (orgId, userId) => {
    const response = await apiClient.delete(`/organizations/${orgId}/members/${userId}`);
    return response;
  },

  /** Người dùng hiện tại tự rời tổ chức */
  leaveOrganization: async (orgId) => {
    const response = await apiClient.post(`/organizations/${orgId}/members/leave`);
    return response;
  },

  // Join organization via invite link (beta)
  joinByInviteLink: async (orgId, token) => {
    const response = await apiClient.post(`/organizations/${orgId}/members/join-link`, { token });
    return response;
  },

  /** Form gia nhập (owner/admin) */
  getJoinApplicationForm: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/join-application-form`);
    return response;
  },
  updateJoinApplicationForm: async (orgId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/join-application-form`, data);
    return response;
  },
  /** Schema công khai (user đã đăng nhập, trước khi vào org) */
  getJoinApplicationFormPublic: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/join-application-form/public`);
    return response;
  },
  submitJoinApplication: async (orgId, answers) => {
    const response = await apiClient.post(`/organizations/${orgId}/join-applications`, { answers });
    return response;
  },
  listJoinApplications: async (orgId, params = {}) => {
    const response = await apiClient.get(`/organizations/${orgId}/join-applications`, { params });
    return response;
  },
  reviewJoinApplication: async (orgId, applicationId, body) => {
    const response = await apiClient.patch(
      `/organizations/${orgId}/join-applications/${applicationId}`,
      body
    );
    return response;
  },

  // Create invite link for organization
  createInviteLink: async (orgId, data = {}) => {
    const response = await apiClient.post(`/organizations/${orgId}/members/invite-link`, data);
    return response;
  },

  // Get organization departments
  getDepartments: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/departments`);
    return response;
  },

  // Create department
  createDepartment: async (orgId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/departments`, data);
    return response;
  },

  // Update department
  updateDepartment: async (orgId, deptId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/departments/${deptId}`, data);
    return response;
  },

  // Delete department
  deleteDepartment: async (orgId, deptId) => {
    const response = await apiClient.delete(`/organizations/${orgId}/departments/${deptId}`);
    return response;
  },

  // Get department channels
  getChannels: async (orgId, deptId) => {
    const response = await apiClient.get(`/organizations/${orgId}/departments/${deptId}/channels`);
    return response;
  },

  // Create channel
  createChannel: async (orgId, deptId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/departments/${deptId}/channels`, data);
    return response;
  },

  // Update channel
  updateChannel: async (orgId, deptId, channelId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/departments/${deptId}/channels/${channelId}`, data);
    return response;
  },

  // Delete channel
  deleteChannel: async (orgId, deptId, channelId) => {
    const response = await apiClient.delete(`/organizations/${orgId}/departments/${deptId}/channels/${channelId}`);
    return response;
  },

  // Get organization statistics
  getStatistics: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/statistics`);
    return response;
  },
};

// Backward-compatible aliases while migrating callers.
organizationAPI.getTeams = organizationAPI.getChannels;
organizationAPI.createTeam = organizationAPI.createChannel;
organizationAPI.updateTeam = organizationAPI.updateChannel;
organizationAPI.deleteTeam = organizationAPI.deleteChannel;
