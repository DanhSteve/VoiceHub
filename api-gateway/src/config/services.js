const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!AUTH_SERVICE_URL) throw new Error('Thiếu biến môi trường: AUTH_SERVICE_URL');
const USER_SERVICE_URL = String(process.env.USER_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!USER_SERVICE_URL) throw new Error('Thiếu biến môi trường: USER_SERVICE_URL');
const FRIEND_SERVICE_URL = String(process.env.FRIEND_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!FRIEND_SERVICE_URL) throw new Error('Thiếu biến môi trường: FRIEND_SERVICE_URL');
const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ORGANIZATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ORGANIZATION_SERVICE_URL');
const ROLE_PERMISSION_SERVICE_URL = String(process.env.ROLE_PERMISSION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ROLE_PERMISSION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ROLE_PERMISSION_SERVICE_URL');
const CHAT_SERVICE_URL = String(process.env.CHAT_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!CHAT_SERVICE_URL) throw new Error('Thiếu biến môi trường: CHAT_SERVICE_URL');
const VOICE_SERVICE_URL = String(process.env.VOICE_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!VOICE_SERVICE_URL) throw new Error('Thiếu biến môi trường: VOICE_SERVICE_URL');
const TASK_SERVICE_URL = String(process.env.TASK_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!TASK_SERVICE_URL) throw new Error('Thiếu biến môi trường: TASK_SERVICE_URL');
const AI_TASK_SERVICE_URL = String(process.env.AI_TASK_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!AI_TASK_SERVICE_URL) throw new Error('Thiếu biến môi trường: AI_TASK_SERVICE_URL');
const DOCUMENT_SERVICE_URL = String(process.env.DOCUMENT_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!DOCUMENT_SERVICE_URL) throw new Error('Thiếu biến môi trường: DOCUMENT_SERVICE_URL');
const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!NOTIFICATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: NOTIFICATION_SERVICE_URL');
const SOCKET_SERVICE_URL = String(process.env.SOCKET_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!SOCKET_SERVICE_URL) throw new Error('Thiếu biến môi trường: SOCKET_SERVICE_URL');
// Cấu hình các microservices — URL chỉ từ biến môi trường (không hardcode hostname nội bộ).
const services = {
  auth: {
    url: AUTH_SERVICE_URL,
    routes: ['/api/auth'],
  },
  user: {
    url: USER_SERVICE_URL,
    routes: ['/api/users'],
  },
  friend: {
    url: FRIEND_SERVICE_URL,
    routes: ['/api/friends'],
  },
  organization: {
    url: ORGANIZATION_SERVICE_URL,
    routes: ['/api/organizations', '/api/channels'],
  },
  rolePermission: {
    url: ROLE_PERMISSION_SERVICE_URL,
    routes: ['/api/roles', '/api/permissions'],
  },
  chat: {
    url: CHAT_SERVICE_URL,
    routes: ['/api/messages', '/api/chat'],
  },
  voice: {
    url: VOICE_SERVICE_URL,
    routes: ['/api/voice', '/api/meetings'],
  },
  task: {
    url: TASK_SERVICE_URL,
    routes: ['/api/tasks', '/api/work'],
  },
  aiTask: {
    url: AI_TASK_SERVICE_URL,
    routes: ['/api/ai/tasks'],
  },
  document: {
    url: DOCUMENT_SERVICE_URL,
    routes: ['/api/documents'],
  },
  notification: {
    url: NOTIFICATION_SERVICE_URL,
    routes: ['/api/notifications'],
  },
  socket: {
    url: SOCKET_SERVICE_URL,
    routes: [],
  },
};

// Routes không cần authentication
const publicRoutes = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh-token',
  '/api/auth/forgot-password',
  '/api/auth/resend-verification',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/health/gateway-trust',
  '/health',
  '/metrics',
  '/favicon.ico',
];

// Chuẩn hóa path: gateway có thể mount tại '/' hoặc '/api', route luôn có dạng /api/...
const normalizePath = (path) => (path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`);

/** Path API đầy đủ từ request (Express 5 / proxy: ưu tiên originalUrl). */
const resolveReqApiPath = (req) => {
  const fromOriginal = String(req.originalUrl || req.url || '')
    .split('?')[0]
    .replace(/\/+/g, '/');
  if (fromOriginal.startsWith('/api')) return fromOriginal;
  return normalizePath(String(req.path || '').split('?')[0]);
};

/** Task boards theo workspace slug — proxy task-service, không organization-service. */
const isWorkspaceTaskBoardPath = (path) => {
  const normalized = normalizePath(path);
  return /^\/api\/workspaces\/[^/]+\/task-boards(\/|$)/i.test(normalized);
};

// Tìm service theo path
const getServiceByPath = (path) => {
  const normalized = normalizePath(path);
  if (isWorkspaceTaskBoardPath(normalized)) {
    return {
      name: 'task',
      url: services.task.url,
    };
  }
  for (const [serviceName, config] of Object.entries(services)) {
    for (const route of config.routes) {
      if (normalized.startsWith(route)) {
        return {
          name: serviceName,
          url: config.url,
        };
      }
    }
  }
  return null;
};

/** Route public — khớp chính xác hoặc prefix có dấu `/` sau (tránh `/health` khớp `/healthcare`). */
const isPublicRoute = (path) => {
  const normalized = String(path || '').split('?')[0].replace(/\/+/g, '/');
  return publicRoutes.some((route) => {
    if (normalized === route) return true;
    if (route.endsWith('/')) return normalized.startsWith(route);
    return normalized.startsWith(`${route}/`);
  });
};

module.exports = {
  services,
  getServiceByPath,
  isPublicRoute,
  normalizePath,
  resolveReqApiPath,
  isWorkspaceTaskBoardPath,
};
