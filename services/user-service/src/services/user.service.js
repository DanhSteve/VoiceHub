const UserProfile = require('../models/UserProfile');
const { getRedisClient, logger } = require('/shared');

class UserService {
  // Tạo user profile mới
  async createUserProfile(userData) {
    try {
      const { userId, username, displayName, dateOfBirth } = userData;

      // Kiểm tra username đã tồn tại chưa
      const existingUser = await UserProfile.findOne({ username });
      if (existingUser) {
        throw new Error('Username already exists');
      }

      const userProfile = new UserProfile({
        userId,
        username,
        displayName: displayName || username,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      });

      await userProfile.save();

      // Cache user profile trong Redis
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(userProfile));
      }

      logger.info(`User profile created: ${userId}`);
      return userProfile;
    } catch (error) {
      logger.error('Error creating user profile:', error);
      throw new Error(`Error creating user profile: ${error.message}`);
    }
  }

  // Lấy user profile theo ID
  async getUserProfileById(userId) {
    try {
      // Kiểm tra cache trước
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const userProfile = await UserProfile.findOne({ userId });

      // Cache user profile
      if (redis && userProfile) {
        const cacheKey = `user:${userId}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(userProfile));
      }

      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile:', error);
      throw new Error(`Error getting user profile: ${error.message}`);
    }
  }

  // Lấy user profile theo username
  async getUserProfileByUsername(username) {
    try {
      const userProfile = await UserProfile.findOne({ username });

      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile by username:', error);
      throw new Error(`Error getting user profile: ${error.message}`);
    }
  }

  // Cập nhật user profile
  async updateUserProfile(userId, updateData) {
    try {
      const allowedFields = [
        'displayName',
        'avatar',
        'bio',
        'phone',
        'dateOfBirth',
        'location',
        'preferences',
      ];

      const updateFields = {};
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      }

      const userProfile = await UserProfile.findOneAndUpdate(
        { userId },
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      if (!userProfile) {
        throw new Error('User profile not found');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        await redis.del(cacheKey);
      }

      logger.info(`User profile updated: ${userId}`);
      return userProfile;
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw new Error(`Error updating user profile: ${error.message}`);
    }
  }

  // Cập nhật status
  async updateStatus(userId, status) {
    try {
      const userProfile = await UserProfile.findOne({ userId });
      if (!userProfile) {
        throw new Error('User profile not found');
      }

      await userProfile.updateStatus(status);

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        await redis.del(cacheKey);
      }

      return userProfile;
    } catch (error) {
      logger.error('Error updating status:', error);
      throw new Error(`Error updating status: ${error.message}`);
    }
  }

  // Tìm kiếm users
  async searchUsers(query, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;

      const searchRegex = new RegExp(query, 'i');
      const filter = {
        $or: [
          { username: searchRegex },
          { displayName: searchRegex },
          { phone: searchRegex },
        ],
        isActive: true,
      };

      const users = await UserProfile.find(filter)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select('userId username displayName avatar status')
        .sort({ username: 1 });

      const total = await UserProfile.countDocuments(filter);

      return {
        users,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };
    } catch (error) {
      logger.error('Error searching users:', error);
      throw new Error(`Error searching users: ${error.message}`);
    }
  }

  // Tìm user profile theo số điện thoại
  async getUserProfileByPhone(phone) {
    try {
      const userProfile = await UserProfile.findOne({ phone, isActive: true });
      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile by phone:', error);
      throw new Error(`Error getting user profile by phone: ${error.message}`);
    }
  }

  // Xóa user profile (soft delete)
  async deleteUserProfile(userId) {
    try {
      const userProfile = await UserProfile.findOneAndUpdate(
        { userId },
        { $set: { isActive: false } },
        { new: true }
      );

      if (!userProfile) {
        throw new Error('User profile not found');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        await redis.del(cacheKey);
      }

      logger.info(`User profile deactivated: ${userId}`);
      return userProfile;
    } catch (error) {
      logger.error('Error deleting user profile:', error);
      throw new Error(`Error deleting user profile: ${error.message}`);
    }
  }
}

module.exports = new UserService();

