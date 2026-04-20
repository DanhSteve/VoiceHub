const roleService = require('../services/role.service');
const { getAction, extractServerId, noPermissionRoutes } = require('../config/permissions');
const { isPublicRoute, normalizePath } = require('../config/services');

/** Cache kết quả checkPermission (giảm tải role-service) */
const permissionCache = new Map();
const CACHE_TTL_MS = Math.max(5000, parseInt(process.env.GATEWAY_PERMISSION_CACHE_TTL_MS || '60000', 10) || 60000);

function cacheKey(userId, serverId, action) {
  return `${userId}|${serverId}|${action}`;
}

/**
 * Middleware kiểm tra quyền truy cập
 * Gọi Role Service để check permission
 */
const permissionMiddleware = async (req, res, next) => {
  try {
    // Bỏ qua routes public (đăng ký, đăng nhập, ...),
    // và các routes được đánh dấu không cần kiểm tra permission
    if (isPublicRoute(req.path) || noPermissionRoutes.some((route) => req.path.startsWith(route))) {
      return next();
    }

    // Lấy userId từ req.user (đã được set bởi authMiddleware)
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized',
      });
    }

    // Task / Work / AI-task: bỏ qua role theo serverId — chạy NGAY và dùng originalUrl vì req.path
    // có thể không khớp (proxy/mount). task-service tự kiểm tra creator/assignee.
    const pathOnly = String(req.originalUrl || req.url || req.path || '')
      .split('?')[0]
      .replace(/\/+/g, '/');
    const pathNorm = normalizePath(pathOnly).toLowerCase();
    if (
      pathNorm.startsWith('/api/tasks') ||
      pathNorm.startsWith('/api/work') ||
      pathNorm.startsWith('/api/ai/tasks')
    ) {
      return next();
    }

    // Lấy action từ route và method
    const action = getAction(req.method, req.path);
    
    // Nếu không có action mapping, cho phép (có thể là route mới chưa config)
    if (!action) {
      console.warn(`No action mapping for ${req.method} ${req.path}`);
      return next();
    }

    // Organization permissions được kiểm tra tại organization-service theo membership thực tế.
    // Bỏ qua check role-service ở gateway để tránh false deny do khác ngữ cảnh serverId.
    if (action.startsWith('organization:')) {
      return next();
    }

    // Role & Permission service: tự xử lý sau khi proxy (JWT đã qua auth middleware).
    // Tránh 403 do gateway map GET /api/roles → get:default và không có quyền trong Discord-style role cache.
    const pathWithoutQueryEarly = req.path.split('?')[0];
    if (
      pathWithoutQueryEarly.startsWith('/api/roles') ||
      pathWithoutQueryEarly.startsWith('/api/permissions')
    ) {
      return next();
    }

    // Voice/WebRTC MVP hiện chưa gắn role-context theo organization/server cho từng event.
    // Cho phép gateway bỏ qua permission check để tránh chặn bootstrap/join room.
    if (action.startsWith('voice:')) {
      return next();
    }

    const pathWithoutQuery = req.path.split('?')[0];
    const isOrganizationGlobalRoute =
      (req.method === 'GET' && pathWithoutQuery === '/api/organizations/my') ||
      (req.method === 'POST' && pathWithoutQuery === '/api/organizations');
    if (isOrganizationGlobalRoute) {
      return next();
    }
    
    // Extract serverId từ request
    const serverId = extractServerId(req);

    // Phân biệt 2 loại chat:
    // - Chat bạn bè (DM): dùng /api/messages (hoặc /messages) → KHÔNG cần serverId/organizationId
    // - Chat doanh nghiệp: dùng /api/chat/... → cần serverId/organizationId để check role
    // Dựa cả vào action mapping và path thực tế để tránh lệch config
    const isMessagesPath =
      req.path.startsWith('/api/messages') ||
      req.path.startsWith('/messages') ||
      req.path.startsWith('/api/chat/messages') ||
      req.path.startsWith('/chat/messages');
    const isChatRoute = action.startsWith('chat:') || isMessagesPath;
    const hasOrgOrServer =
      req.query?.organizationId ||
      req.params?.organizationId ||
      req.body?.organizationId ||
      req.query?.serverId ||
      req.params?.serverId ||
      req.body?.serverId;
    const hasReceiverId =
      req.query?.receiverId ||
      req.params?.receiverId ||
      req.body?.receiverId;

    // Chat bạn bè (DM) dùng /api/messages:
    // Bất cứ request nào tới messages mà KHÔNG có serverId/organizationId
    // → coi là DM, bỏ qua permission context để tránh chặn FE.
    if (isMessagesPath && !hasOrgOrServer) {
      return next();
    }
    
    // Nếu không có serverId, có thể là global action (như friend, user profile)
    // Cho phép trong trường hợp này
    if (!serverId) {
      // Một số actions không cần serverId
      const globalActions = ['friend:', 'user:read', 'user:write'];
      if (globalActions.some((prefix) => action.startsWith(prefix))) {
        return next();
      }
      
      // Các actions khác cần serverId (bao gồm chat doanh nghiệp)
      return res.status(400).json({
        success: false,
        message: 'serverId or organizationId is required',
      });
    }

    const ck = cacheKey(userId, serverId, action);
    const now = Date.now();
    const hit = permissionCache.get(ck);
    if (hit && now - hit.at < CACHE_TTL_MS) {
      if (hit.allowed) {
        return next();
      }
      return res.status(403).json({
        success: false,
        message: 'Permission denied',
        reason: hit.reason || 'You do not have permission to perform this action',
      });
    }

    const { allowed, reason } = await roleService.checkPermission(
      userId,
      serverId,
      action
    );

    permissionCache.set(ck, { allowed, reason, at: now });

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied',
        reason: reason || 'You do not have permission to perform this action',
      });
    }

    next();
  } catch (error) {
    console.error('Permission middleware error:', error);
    
    // Fail-closed: deny access khi có lỗi
    return res.status(500).json({
      success: false,
      message: 'Permission check failed',
      error: error.message,
    });
  }
};

module.exports = permissionMiddleware;



