// Cấu hình các microservices
const services = {
  auth: {
    url: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001',
    routes: ['/api/auth'],
  },
  user: {
    url: process.env.USER_SERVICE_URL || 'http://user-service:3004',
    routes: ['/api/users'],
  },
  friend: {
    url: process.env.FRIEND_SERVICE_URL || 'http://friend-service:3014',
    routes: ['/api/friends'],
  },
  organization: {
    url: process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013',
    routes: ['/api/organizations', '/api/channels'],
  },
  rolePermission: {
    url: process.env.ROLE_PERMISSION_SERVICE_URL || 'http://role-permission-service:3015',
    routes: ['/api/roles', '/api/permissions'],
  },
  chat: {
    url: process.env.CHAT_SERVICE_URL || 'http://chat-service:3006',
    routes: ['/api/messages', '/api/chat'],
  },
  voice: {
    url: process.env.VOICE_SERVICE_URL || 'http://voice-service:3005',
    routes: ['/api/voice', '/api/meetings'],
  },
  task: {
    url: process.env.TASK_SERVICE_URL || 'http://task-service:3009',
    routes: ['/api/tasks', '/api/work'],
  },
  aiTask: {
    url: process.env.AI_TASK_SERVICE_URL || 'http://ai-task-service:3020',
    routes: ['/api/ai/tasks'],
  },
  document: {
    url: process.env.DOCUMENT_SERVICE_URL || 'http://document-service:3010',
    routes: ['/api/documents'],
  },
  notification: {
    url: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3003',
    routes: ['/api/notifications'],
  },
  socket: {
    url: process.env.SOCKET_SERVICE_URL || 'http://socket-service:3017',
    routes: [],
  },
};

// Routes không cần authentication
const publicRoutes = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh-token',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/health',
  '/metrics',
  '/favicon.ico',
];

// Chuẩn hóa path: gateway có thể mount tại '/' hoặc '/api', route luôn có dạng /api/...
const normalizePath = (path) => (path.startsWith('/api') ? path : `/api${path.startsWith('/') ? path : `/${path}`}`);

// Tìm service theo path
const getServiceByPath = (path) => {
  const normalized = normalizePath(path);
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

// Kiểm tra route có public không
const isPublicRoute = (path) => {
  return publicRoutes.some((route) => path.startsWith(route));
};

module.exports = {
  services,
  getServiceByPath,
  isPublicRoute,
  normalizePath,
};




