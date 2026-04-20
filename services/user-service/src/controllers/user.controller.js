const userService = require('../services/user.service');
const { logger, getRedisClient } = require('/shared');

class UserController {
  // Tạo user profile mới
  async createUserProfile(req, res) {
    try {
      const { userId, username, email, displayName, dateOfBirth } = req.body;

      if (!userId || !username) {
        return res.status(400).json({
          success: false,
          message: 'userId and username are required',
        });
      }
      if (!email || typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({
          success: false,
          message: 'email is required',
        });
      }

      const userProfile = await userService.createUserProfile({
        userId,
        username,
        email: email.trim().toLowerCase(),
        displayName,
        dateOfBirth,
      });

      res.status(201).json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Create user profile error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy user profile theo ID
  async getUserProfileById(req, res) {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
        });
      }
      const userProfile = await userService.getUserProfileById(userId);

      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
      }

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Get user profile error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy user profile theo username
  async getUserProfileByUsername(req, res) {
    try {
      const { username } = req.params;
      if (!username || !String(username).trim()) {
        return res.status(400).json({
          success: false,
          message: 'username is required',
        });
      }
      const userProfile = await userService.getUserProfileByUsername(username);

      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
      }

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Get user profile by username error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy user profile theo số điện thoại
  async getUserProfileByPhone(req, res) {
    try {
      const { phone } = req.params;

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone is required',
        });
      }

      const userProfile = await userService.getUserProfileByPhone(phone);

      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
      }

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Get user profile by phone error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy thông tin user hiện tại (userId từ gateway header x-user-id hoặc userContext)
  async getCurrentUser(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId || req.headers['x-user-id'];

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      // Update status to 'online' khi user active
      try {
        await userService.updateStatus(userId, 'online');
      } catch (statusError) {
        logger.warn('Failed to update user status:', statusError.message);
        // Không throw error, vẫn lấy user profile
      }

      const userProfile = await userService.getUserProfileById(userId);

      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
      }

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Get current user error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Cập nhật user profile
  async updateUserProfile(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId || req.headers['x-user-id'] || req.params.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const userProfile = await userService.updateUserProfile(userId, body);

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Update user profile error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Cập nhật status
  async updateStatus(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId || req.headers['x-user-id'];
      const { status } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!status || !['online', 'offline', 'away', 'busy'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status',
        });
      }

      const userProfile = await userService.updateStatus(userId, status);

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Update status error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Cập nhật status từ dịch vụ nội bộ (socket-service presence).
   * PATCH body: { userId, status } — đã qua internalServiceAuth.
   */
  /**
   * Batch đọc presence "nóng" từ Redis (socket-service ghi vh:presence:*).
   * friend-service / gateway có thể gọi để merge với profile.
   */
  async internalPresenceBatch(req, res) {
    try {
      const { userIds } = req.body || {};
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'userIds must be a non-empty array',
        });
      }

      const PREFIX = process.env.PRESENCE_REDIS_PREFIX || 'vh:presence:';
      const slice = userIds.slice(0, 200).map((id) => String(id));
      const out = {};

      let redis;
      try {
        redis = getRedisClient();
      } catch {
        redis = null;
      }

      if (redis) {
        const pipeline = redis.pipeline();
        for (const id of slice) {
          pipeline.get(`${PREFIX}${id}`);
        }
        const results = await pipeline.exec();
        slice.forEach((id, i) => {
          const val = results[i]?.[1];
          out[id] = val === 'online' ? 'online' : 'offline';
        });
      } else {
        for (const id of slice) {
          out[id] = 'offline';
        }
      }

      res.json({
        success: true,
        data: out,
      });
    } catch (error) {
      logger.error('internalPresenceBatch error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  async patchInternalStatus(req, res) {
    try {
      const { userId, status } = req.body || {};

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
        });
      }

      if (!status || !['online', 'offline', 'away', 'busy'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status',
        });
      }

      const userProfile = await userService.updateStatus(userId, status);

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Internal patch status error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Tìm kiếm users
  async searchUsers(req, res) {
    try {
      const { q, page, limit } = req.query;

      if (!q || String(q).trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Search query is required',
        });
      }

      const result = await userService.searchUsers(q, {
        page: page || 1,
        limit: limit || 20,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Search users error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa user profile
  async deleteUserProfile(req, res) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.id || req.userContext?.userId || req.headers['x-user-id'];

      if (!currentUserId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const currentStr = String(currentUserId);
      const targetStr = String(userId);
      if (targetStr !== currentStr) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden',
        });
      }

      const userProfile = await userService.deleteUserProfile(userId);

      res.json({
        success: true,
        message: 'User profile deleted successfully',
        data: userProfile,
      });
    } catch (error) {
      logger.error('Delete user profile error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new UserController();

