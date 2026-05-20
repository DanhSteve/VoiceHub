import apiClient from './apiClient';

function buildQueryParams(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v != null && v !== '') params.set(k, String(v));
  });
  return params;
}

/** Gateway permission: extractServerId đọc query (không cần parse JSON body). */
function orgQuery(organizationId) {
  if (organizationId == null || organizationId === '') return '';
  return `?organizationId=${encodeURIComponent(String(organizationId))}`;
}

export const taskAPI = {
  // Get all tasks — truyền object: { organizationId?, dueFrom?, dueTo?, status?, ... }
  getTasks: (filters = {}) => {
    const params = buildQueryParams(filters);
    const q = params.toString();
    return apiClient.get(q ? `/tasks?${q}` : '/tasks');
  },

  // Create new task
  createTask: (taskData) => {
    const payload = { ...(taskData || {}) };
    if (!payload.serverId && payload.organizationId) {
      payload.serverId = payload.organizationId;
    }
    return apiClient.post('/tasks', payload);
  },

  // Get task by ID
  getTask: (id, opts = {}) => {
    return apiClient.get(`/tasks/${id}${orgQuery(opts.organizationId)}`);
  },

  // Update task — opts.organizationId giúp API Gateway có ngữ cảnh org (query string)
  updateTask: (id, updates, opts = {}) => {
    return apiClient.put(`/tasks/${id}${orgQuery(opts.organizationId)}`, updates);
  },

  // Delete task
  deleteTask: (id, opts = {}) => {
    return apiClient.delete(`/tasks/${id}${orgQuery(opts.organizationId)}`);
  },

  // Update task status
  updateStatus: (id, status, opts = {}) => {
    return apiClient.patch(`/tasks/${id}/status${orgQuery(opts.organizationId)}`, { status });
  },

  // Assign task to user
  assignTask: (id, userId, opts = {}) => {
    return apiClient.post(`/tasks/${id}/assign${orgQuery(opts.organizationId)}`, { userId });
  },

  // Get task statistics
  getStatistics: (organizationId) => {
    if (organizationId == null || organizationId === '') {
      return apiClient.get('/tasks/statistics');
    }
    return apiClient.get(`/tasks/statistics?organizationId=${encodeURIComponent(organizationId)}`);
  },
};
