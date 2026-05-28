import apiClient from './apiClient';

function buildQueryParams(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v != null && v !== '') params.set(k, String(v));
  });
  return params;
}

/**
 * apiClient interceptor đã trả thẳng response.data — unwrap { success, data } hoặc { status, data }.
 */
export function unwrapTaskApiPayload(res) {
  if (res == null) return null;
  const hasEnvelope =
    res?.data !== undefined && (res?.success !== undefined || res?.status !== undefined);
  const first = hasEnvelope ? res.data : res;
  if (
    first &&
    typeof first === 'object' &&
    first.data !== undefined &&
    (first.success !== undefined || first.status !== undefined)
  ) {
    return first.data;
  }
  return first;
}

export function unwrapTaskBoardListPayload(res) {
  const payload = unwrapTaskApiPayload(res);
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function unwrapTaskBoardDetailPayload(res) {
  const payload = unwrapTaskApiPayload(res);
  if (!payload || typeof payload !== 'object') return null;
  if (payload.board || Array.isArray(payload.lists)) return payload;
  return null;
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

  createBoard: (payload) => apiClient.post('/tasks/boards', payload),
  getBoards: (filters = {}) => {
    const params = buildQueryParams(filters);
    const q = params.toString();
    return apiClient.get(q ? `/tasks/boards?${q}` : '/tasks/boards');
  },
  getBoardDetail: (boardId) => apiClient.get(`/tasks/boards/${boardId}`),
  getBoardAssignableMembers: (boardId) =>
    apiClient.get(`/tasks/boards/${boardId}/assignable-members`),
  createBoardList: (boardId, payload) => apiClient.post(`/tasks/boards/${boardId}/lists`, payload),
  reorderBoardList: (boardId, listId, payload) =>
    apiClient.patch(`/tasks/boards/${boardId}/lists/${listId}`, payload),
  copyBoardList: (boardId, listId, payload) =>
    apiClient.post(`/tasks/boards/${boardId}/lists/${listId}/copy`, payload),
  moveBoardList: (boardId, listId, payload) =>
    apiClient.post(`/tasks/boards/${boardId}/lists/${listId}/move`, payload),
  moveAllBoardListCards: (boardId, listId, payload) =>
    apiClient.post(`/tasks/boards/${boardId}/lists/${listId}/move-all-cards`, payload),
  watchBoardList: (boardId, listId) =>
    apiClient.post(`/tasks/boards/${boardId}/lists/${listId}/watch`),
  unwatchBoardList: (boardId, listId) =>
    apiClient.delete(`/tasks/boards/${boardId}/lists/${listId}/watch`),
  archiveBoardList: (boardId, listId) =>
    apiClient.delete(`/tasks/boards/${boardId}/lists/${listId}`),
  createBoardCard: (boardId, payload) => apiClient.post(`/tasks/boards/${boardId}/cards`, payload),
  moveBoardCard: (cardId, payload) => apiClient.patch(`/tasks/boards/cards/${cardId}/move`, payload),
  copyBoardCard: (cardId, payload = {}) =>
    apiClient.post(`/tasks/boards/cards/${cardId}/copy`, payload),
  archiveBoardCard: (cardId) => apiClient.delete(`/tasks/boards/cards/${cardId}`),
  updateBoardCard: (cardId, payload) => apiClient.patch(`/tasks/boards/cards/${cardId}`, payload),
  addBoardCardComment: (cardId, content) =>
    apiClient.post(`/tasks/boards/cards/${cardId}/comments`, { content }),
};
