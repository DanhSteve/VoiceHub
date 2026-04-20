/**
 * Mapping routes và HTTP methods thành actions
 * Route pattern -> Action mapping
 */
const routeActionMap = {
  // Chat Service
  'GET /api/messages': 'chat:read',
  'GET /api/messages/search': 'chat:read',
  'POST /api/messages': 'chat:write',
  'POST /api/messages/storage/signed-upload': 'chat:write',
  'PATCH /api/messages': 'chat:write',
  'DELETE /api/messages': 'chat:delete',
  'GET /api/chat/messages': 'chat:read',
  'POST /api/chat/messages': 'chat:write',
  'POST /api/chat/messages/storage/signed-upload': 'chat:write',
  'PATCH /api/chat/messages': 'chat:write',
  'DELETE /api/chat/messages': 'chat:delete',

  // Task Service
  'GET /api/tasks': 'task:read',
  'POST /api/tasks': 'task:write',
  'PUT /api/tasks': 'task:write',
  'PATCH /api/tasks': 'task:write',
  'DELETE /api/tasks': 'task:delete',
  'GET /api/work': 'task:read',
  'POST /api/work': 'task:write',

  // AI Task Service
  'POST /api/ai/tasks/extract': 'task:write',
  'GET /api/ai/tasks/extractions': 'task:read',
  'POST /api/ai/tasks/confirm': 'task:write',

  // Document Service
  'GET /api/documents': 'document:read',
  'POST /api/documents': 'document:write',
  'DELETE /api/documents': 'document:delete',

  // Voice Service
  'GET /api/voice': 'voice:read',
  'POST /api/voice': 'voice:write',
  'GET /api/meetings': 'voice:read',
  'POST /api/meetings': 'voice:write',

  // Organization Service
  'GET /api/organizations': 'organization:read',
  'POST /api/organizations': 'organization:write',
  'PUT /api/organizations': 'organization:write',
  'PATCH /api/organizations': 'organization:write',
  'DELETE /api/organizations': 'organization:delete',
  'GET /api/organizations/my': 'organization:read',
  'GET /api/organizations/:orgId/departments': 'organization:read',
  'POST /api/organizations/:orgId/departments': 'organization:write',
  'PUT /api/organizations/:orgId/departments': 'organization:write',
  'DELETE /api/organizations/:orgId/departments': 'organization:delete',
  'GET /api/organizations/:orgId/members': 'organization:read',
  'POST /api/organizations/:orgId/members/leave': 'organization:read',
  'POST /api/organizations/:orgId/members': 'organization:write',
  'PUT /api/organizations/:orgId/members': 'organization:write',
  'DELETE /api/organizations/:orgId/members': 'organization:delete',
  'GET /api/organizations/:orgId/departments/:deptId/channels': 'organization:read',
  'POST /api/organizations/:orgId/departments/:deptId/channels': 'organization:write',
  'PUT /api/organizations/:orgId/departments/:deptId/channels': 'organization:write',
  'DELETE /api/organizations/:orgId/departments/:deptId/channels': 'organization:delete',

  // User Service (thường không cần server context)
  'GET /api/users': 'user:read',
  'PATCH /api/users': 'user:write',

  // Friend Service (không cần server context)
  'GET /api/friends': 'friend:read',
  'POST /api/friends': 'friend:write',
};

/**
 * Routes không cần kiểm tra permission (chỉ cần authentication)
 * Bao gồm:
 * - Auth routes (logout, change-password, me) - không cần server context
 * - User profile routes
 * - Friend routes
 * - Notification routes
 */
const noPermissionRoutes = [
  '/api/auth/logout',
  '/api/auth/change-password',
  '/api/auth/me',
  // User profile & avatar không phụ thuộc server/organization
  '/api/users/me',
  '/api/users/avatar',
  // Friend routes không cần server context
  '/api/friends',
  '/api/notifications',
  '/api/organizations/my',
];

/**
 * Lấy action từ route và method
 * @param {string} method - HTTP method
 * @param {string} path - Route path
 * @returns {string|null} Action hoặc null nếu không cần check
 */
const getAction = (method, path) => {
  const pathWithoutQuery = path.split('?')[0];

  // Kiểm tra routes không cần permission
  if (noPermissionRoutes.some((route) => pathWithoutQuery.startsWith(route))) {
    return null;
  }

  const key = `${method} ${pathWithoutQuery}`;
  
  // Tìm exact match trước
  if (routeActionMap[key]) {
    return routeActionMap[key];
  }

  // Tìm pattern match (hỗ trợ dynamic params như :orgId, :deptId)
  for (const [pattern, action] of Object.entries(routeActionMap)) {
    const [patternMethod, patternPath] = pattern.split(' ');
    
    if (patternMethod !== method) {
      continue;
    }

    const patternRegex = new RegExp(
      `^${patternPath.replace(/:[^/]+/g, '[^/]+')}(?:/.*)?$`
    );

    if (patternRegex.test(pathWithoutQuery)) {
      return action;
    }
  }

  // Default action nếu không match
  return `${method.toLowerCase()}:default`;
};

/**
 * Extract serverId từ request
 * @param {Object} req - Express request object
 * @returns {string|null} Server ID hoặc null
 */
const extractServerId = (req) => {
  const path = req.path || '';
  const isOrganizationRoute = path.startsWith('/api/organizations');
  const pathWithoutQuery = path.split('?')[0];
  const organizationIdFromPath =
    pathWithoutQuery.match(/^\/api\/organizations\/([^/]+)(?:\/|$)/)?.[1] || null;
  const normalizedOrgId =
    organizationIdFromPath && organizationIdFromPath !== 'my' ? organizationIdFromPath : null;

  // Ưu tiên: query > params > body > header
  // Sử dụng optional chaining để tránh lỗi khi req.body undefined
  return (
    req.query?.serverId ||
    req.query?.organizationId ||
    (isOrganizationRoute ? req.query?.orgId : null) ||
    req.params?.serverId ||
    req.params?.organizationId ||
    req.params?.orgId ||
    req.params?.id ||
    normalizedOrgId ||
    req.body?.serverId ||
    req.body?.organizationId ||
    (isOrganizationRoute ? req.body?.orgId : null) ||
    req.headers['x-server-id'] ||
    req.headers['x-organization-id'] ||
    null
  );
};

module.exports = {
  getAction,
  extractServerId,
  noPermissionRoutes,
};



