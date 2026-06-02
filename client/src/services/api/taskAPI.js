import apiClient from './apiClient';

function buildQueryParams(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (k === 'workspaceSlug' || k === 'slug') return;
    if (v != null && v !== '') params.set(k, String(v));
  });
  return params;
}

/** legacy | workspace | dual (mặc định dual khi có workspaceSlug) */
export function getTaskApiMode() {
  const raw = String(import.meta.env.VITE_TASK_API_MODE || 'dual')
    .trim()
    .toLowerCase();
  return ['legacy', 'workspace', 'dual'].includes(raw) ? raw : 'dual';
}

export function extractWorkspaceApiContext(source = {}) {
  const workspaceSlug = String(source.workspaceSlug || source.slug || '').trim();
  const organizationId =
    source.organizationId != null && source.organizationId !== ''
      ? String(source.organizationId)
      : '';
  return { workspaceSlug, organizationId };
}

function stripWorkspaceKeys(obj = {}) {
  const next = { ...(obj || {}) };
  delete next.workspaceSlug;
  delete next.slug;
  return next;
}

function legacyBoardBase() {
  return '/tasks/boards';
}

function workspaceBoardBase(workspaceSlug) {
  return `/workspaces/${encodeURIComponent(workspaceSlug)}/task-boards`;
}

function shouldTryWorkspace(ctx) {
  const mode = getTaskApiMode();
  if (mode === 'legacy') return false;
  if (!ctx.workspaceSlug) return false;
  if (mode === 'workspace') return true;
  return true;
}

function isFallbackableError(err) {
  const status = Number(err?.response?.status || err?.status || 0);
  return status === 404 || status === 501 || status === 502 || status === 503;
}

async function requestWithWorkspaceFallback({ ctx, workspaceRequest, legacyRequest }) {
  const mode = getTaskApiMode();
  if (mode === 'legacy' || !ctx.workspaceSlug) {
    return legacyRequest();
  }
  if (mode === 'workspace') {
    return workspaceRequest();
  }
  try {
    return await workspaceRequest();
  } catch (err) {
    if (!isFallbackableError(err)) throw err;
    return legacyRequest();
  }
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

function boardOptsFromArgs(second, third) {
  if (third && typeof third === 'object') return extractWorkspaceApiContext(third);
  if (second && typeof second === 'object' && !Array.isArray(second)) {
    const ctx = extractWorkspaceApiContext(second);
    if (ctx.workspaceSlug || ctx.organizationId) return ctx;
  }
  return {};
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
    const payload = stripWorkspaceKeys({ ...(taskData || {}) });
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

  createBoard: (payload = {}) => {
    const ctx = extractWorkspaceApiContext(payload);
    const body = stripWorkspaceKeys(payload);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () => apiClient.post(workspaceBoardBase(ctx.workspaceSlug), body),
      legacyRequest: () => apiClient.post(`${legacyBoardBase()}`, body),
    });
  },

  getBoards: (filters = {}) => {
    const ctx = extractWorkspaceApiContext(filters);
    const params = buildQueryParams(filters);
    const q = params.toString();
    const legacyPath = q ? `${legacyBoardBase()}?${q}` : legacyBoardBase();
    const workspacePath = q
      ? `${workspaceBoardBase(ctx.workspaceSlug)}?${q}`
      : workspaceBoardBase(ctx.workspaceSlug);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () => apiClient.get(workspacePath),
      legacyRequest: () => apiClient.get(legacyPath),
    });
  },

  getBoardDetail: (boardId, opts = {}) => {
    const ctx = extractWorkspaceApiContext(opts);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () => apiClient.get(`${workspaceBoardBase(ctx.workspaceSlug)}/${boardId}`),
      legacyRequest: () => apiClient.get(`${legacyBoardBase()}/${boardId}`),
    });
  },

  getBoardAssignableMembers: (boardId, opts = {}) => {
    const ctx = extractWorkspaceApiContext(opts);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.get(`${workspaceBoardBase(ctx.workspaceSlug)}/${boardId}/assignable-members`),
      legacyRequest: () => apiClient.get(`${legacyBoardBase()}/${boardId}/assignable-members`),
    });
  },

  createBoardList: (boardId, payload = {}, opts = {}) => {
    const ctx = boardOptsFromArgs(payload, opts) || extractWorkspaceApiContext(opts);
    const body = stripWorkspaceKeys(payload);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.post(`${workspaceBoardBase(ctx.workspaceSlug)}/${boardId}/lists`, body),
      legacyRequest: () => apiClient.post(`${legacyBoardBase()}/${boardId}/lists`, body),
    });
  },

  reorderBoardList: (boardId, listId, payload = {}, opts = {}) => {
    const ctx = boardOptsFromArgs(payload, opts) || extractWorkspaceApiContext(opts);
    const body = stripWorkspaceKeys(payload);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.patch(
          `${workspaceBoardBase(ctx.workspaceSlug)}/${boardId}/lists/${listId}`,
          body
        ),
      legacyRequest: () =>
        apiClient.patch(`${legacyBoardBase()}/${boardId}/lists/${listId}`, body),
    });
  },

  copyBoardList: (boardId, listId, payload = {}, opts = {}) => {
    const ctx = boardOptsFromArgs(payload, opts) || extractWorkspaceApiContext(opts);
    const body = stripWorkspaceKeys(payload);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.post(
          `${workspaceBoardBase(ctx.workspaceSlug)}/${boardId}/lists/${listId}/copy`,
          body
        ),
      legacyRequest: () =>
        apiClient.post(`${legacyBoardBase()}/${boardId}/lists/${listId}/copy`, body),
    });
  },

  moveBoardList: (boardId, listId, payload = {}, opts = {}) => {
    const ctx = boardOptsFromArgs(payload, opts) || extractWorkspaceApiContext(opts);
    const body = stripWorkspaceKeys(payload);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.post(
          `${workspaceBoardBase(ctx.workspaceSlug)}/${boardId}/lists/${listId}/move`,
          body
        ),
      legacyRequest: () =>
        apiClient.post(`${legacyBoardBase()}/${boardId}/lists/${listId}/move`, body),
    });
  },

  moveAllBoardListCards: (boardId, listId, payload = {}, opts = {}) => {
    const ctx = boardOptsFromArgs(payload, opts) || extractWorkspaceApiContext(opts);
    const body = stripWorkspaceKeys(payload);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.post(
          `${workspaceBoardBase(ctx.workspaceSlug)}/${boardId}/lists/${listId}/move-all-cards`,
          body
        ),
      legacyRequest: () =>
        apiClient.post(`${legacyBoardBase()}/${boardId}/lists/${listId}/move-all-cards`, body),
    });
  },

  watchBoardList: (boardId, listId, opts = {}) => {
    const ctx = extractWorkspaceApiContext(opts);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.post(
          `${workspaceBoardBase(ctx.workspaceSlug)}/${boardId}/lists/${listId}/watch`
        ),
      legacyRequest: () => apiClient.post(`${legacyBoardBase()}/${boardId}/lists/${listId}/watch`),
    });
  },

  unwatchBoardList: (boardId, listId, opts = {}) => {
    const ctx = extractWorkspaceApiContext(opts);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.delete(
          `${workspaceBoardBase(ctx.workspaceSlug)}/${boardId}/lists/${listId}/watch`
        ),
      legacyRequest: () =>
        apiClient.delete(`${legacyBoardBase()}/${boardId}/lists/${listId}/watch`),
    });
  },

  archiveBoardList: (boardId, listId, opts = {}) => {
    const ctx = extractWorkspaceApiContext(opts);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.delete(
          `${workspaceBoardBase(ctx.workspaceSlug)}/${boardId}/lists/${listId}`
        ),
      legacyRequest: () => apiClient.delete(`${legacyBoardBase()}/${boardId}/lists/${listId}`),
    });
  },

  createBoardCard: (boardId, payload = {}, opts = {}) => {
    const ctx = boardOptsFromArgs(payload, opts) || extractWorkspaceApiContext(opts);
    const body = stripWorkspaceKeys(payload);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.post(`${workspaceBoardBase(ctx.workspaceSlug)}/${boardId}/cards`, body),
      legacyRequest: () => apiClient.post(`${legacyBoardBase()}/${boardId}/cards`, body),
    });
  },

  moveBoardCard: (cardId, payload = {}, opts = {}) => {
    const ctx = boardOptsFromArgs(payload, opts) || extractWorkspaceApiContext(opts);
    const body = stripWorkspaceKeys(payload);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.patch(`${workspaceBoardBase(ctx.workspaceSlug)}/cards/${cardId}/move`, body),
      legacyRequest: () => apiClient.patch(`${legacyBoardBase()}/cards/${cardId}/move`, body),
    });
  },

  copyBoardCard: (cardId, payload = {}, opts = {}) => {
    const ctx = boardOptsFromArgs(payload, opts) || extractWorkspaceApiContext(opts);
    const body = stripWorkspaceKeys(payload);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.post(`${workspaceBoardBase(ctx.workspaceSlug)}/cards/${cardId}/copy`, body),
      legacyRequest: () => apiClient.post(`${legacyBoardBase()}/cards/${cardId}/copy`, body),
    });
  },

  archiveBoardCard: (cardId, opts = {}) => {
    const ctx = extractWorkspaceApiContext(opts);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.delete(`${workspaceBoardBase(ctx.workspaceSlug)}/cards/${cardId}`),
      legacyRequest: () => apiClient.delete(`${legacyBoardBase()}/cards/${cardId}`),
    });
  },

  updateBoardCard: (cardId, payload = {}, opts = {}) => {
    const ctx = boardOptsFromArgs(payload, opts) || extractWorkspaceApiContext(opts);
    const body = stripWorkspaceKeys(payload);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.patch(`${workspaceBoardBase(ctx.workspaceSlug)}/cards/${cardId}`, body),
      legacyRequest: () => apiClient.patch(`${legacyBoardBase()}/cards/${cardId}`, body),
    });
  },

  addBoardCardComment: (cardId, content, opts = {}) => {
    const ctx = extractWorkspaceApiContext(opts);
    return requestWithWorkspaceFallback({
      ctx,
      workspaceRequest: () =>
        apiClient.post(`${workspaceBoardBase(ctx.workspaceSlug)}/cards/${cardId}/comments`, {
          content,
        }),
      legacyRequest: () =>
        apiClient.post(`${legacyBoardBase()}/cards/${cardId}/comments`, { content }),
    });
  },
};

/** @deprecated dùng getTaskApiMode — export để test */
export const __taskApiInternals = {
  shouldTryWorkspace,
  isFallbackableError,
  legacyBoardBase,
  workspaceBoardBase,
};
