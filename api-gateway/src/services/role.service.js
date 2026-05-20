const axios = require('axios');
const { services } = require('../config/services');

const ROLE_SERVICE_URL = services.rolePermission.url;

function internalHeaders() {
  const t = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  const h = { 'Content-Type': 'application/json' };
  if (t) h['x-gateway-internal-token'] = t;
  return h;
}

/**
 * Service client để gọi Role Service
 */
class RoleService {
  /**
   * Kiểm tra quyền truy cập
   * @param {string} userId - User ID
   * @param {string} serverId - Server/Organization ID
   * @param {string} action - Action cần kiểm tra (read, write, delete, etc.)
   * @returns {Promise<{allowed: boolean, reason?: string}>}
   */
  async checkPermission(userId, serverId, action) {
    try {
      const response = await axios.post(
        `${ROLE_SERVICE_URL}/api/permissions/check`,
        {
          userId,
          serverId,
          action,
        },
        {
          timeout: 5000, // 5 seconds timeout
          headers: internalHeaders(),
        }
      );

      return {
        allowed: response.data.success && response.data.data?.allowed === true,
        reason: response.data.data?.reason,
      };
    } catch (error) {
      // Nếu Role Service không available, log và deny access
      console.error('Role Service error:', error.message);
      
      // Nếu là lỗi network hoặc timeout, có thể cho phép (fail-open) hoặc deny (fail-closed)
      // Ở đây chọn fail-closed để đảm bảo security
      return {
        allowed: false,
        reason: 'Permission check failed',
      };
    }
  }

  /**
   * Lấy role của user trong server
   * @param {string} userId - User ID
   * @param {string} serverId - Server/Organization ID
   * @returns {Promise<Object|null>}
   */
  async getUserRole(userId, serverId) {
    try {
      const response = await axios.get(
        `${ROLE_SERVICE_URL}/api/roles/user/${userId}/server/${serverId}`,
        {
          timeout: 5000,
          headers: internalHeaders(),
        }
      );

      return response.data.success ? response.data.data : null;
    } catch (error) {
      console.error('Role Service error:', error.message);
      return null;
    }
  }
}

module.exports = new RoleService();



