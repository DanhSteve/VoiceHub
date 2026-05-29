const UserProfile = require('../models/UserProfile');
const { getRedisClient, logger } = require('/shared');
const { phoneBlindIndex } = require('/shared/utils/fieldCrypto');
const {
  writePiiPatch,
  writeEmailPatch,
  writeDateOfBirthFields,
  maybeMigrateProfilePii,
  readPiiFromProfile,
} = require('../utils/profilePii');

function serviceError(message, statusCode = 400, errorCode = 'USER_VALIDATION') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

class UserService {
  // Tạo user profile mới
  async createUserProfile(userData) {
    try {
      const { userId, username, email, displayName, dateOfBirth } = userData;

      if (!userId) {
        throw serviceError('Thiếu userId', 400, 'USER_VALIDATION');
      }
      if (!email || typeof email !== 'string' || !String(email).trim()) {
        throw serviceError('Thiếu email', 400, 'USER_VALIDATION');
      }
      const normalizedEmail = String(email).trim().toLowerCase();

      let finalUsername = String(username || '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
      if (finalUsername.length < 3) {
        finalUsername = normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'user';
      }
      if (finalUsername.length < 3) {
        finalUsername = `user${String(userId).slice(-6)}`;
      }

      let attempt = 0;
      while (attempt < 6) {
        const existingUser = await UserProfile.findOne({ username: finalUsername });
        if (!existingUser) break;
        attempt += 1;
        const suffix = String(userId).slice(-4);
        finalUsername =
          attempt === 1
            ? `${finalUsername}_${suffix}`
            : `${String(username || 'user').trim().slice(0, 20)}_${suffix}${attempt}`;
      }
      const taken = await UserProfile.findOne({ username: finalUsername });
      if (taken) {
        throw serviceError('Tên người dùng đã tồn tại', 400, 'USER_USERNAME_EXISTS');
      }

      const userProfile = new UserProfile({
        userId,
        username: finalUsername,
        ...writeEmailPatch(normalizedEmail),
        displayName: displayName || finalUsername,
        ...writeDateOfBirthFields(dateOfBirth || null),
      });

      await userProfile.save();

      // Cache user profile trong Redis (plaintext cho API)
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        const plain =
          typeof userProfile.toObject === 'function' ? userProfile.toObject() : { ...userProfile };
        const forCache = { ...plain, ...readPiiFromProfile(plain) };
        await redis.setex(cacheKey, 3600, JSON.stringify(forCache));
      }

      logger.info(`User profile created: ${userId}`);
      return userProfile;
    } catch (error) {
      logger.error('Error creating user profile:', error);
      throw error;
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

      let userProfile = await UserProfile.findOne({ userId });
      if (userProfile) {
        await maybeMigrateProfilePii(UserProfile, userProfile);
      }

      // Cache user profile (plaintext PII cho API)
      if (redis && userProfile) {
        const cacheKey = `user:${userId}`;
        const plain =
          typeof userProfile.toObject === 'function' ? userProfile.toObject() : { ...userProfile };
        const forCache = { ...plain, ...readPiiFromProfile(plain) };
        await redis.setex(cacheKey, 3600, JSON.stringify(forCache));
      }

      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile:', error);
      throw error;
    }
  }

  // Lấy user profile theo username
  async getUserProfileByUsername(username) {
    try {
      const userProfile = await UserProfile.findOne({ username });

      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile by username:', error);
      throw error;
    }
  }

  // Cập nhật user profile
  async updateUserProfile(userId, updateData) {
    try {
      const allowedFields = ['displayName', 'avatar', 'preferences', 'isInvisible', 'status'];

      const existingProfile = await UserProfile.findOne({ userId }).lean();

      const updateFields = {};
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      }

      if (updateData.orgNicknames !== undefined && updateData.orgNicknames !== null) {
        const prev =
          existingProfile?.orgNicknames && typeof existingProfile.orgNicknames === 'object'
            ? existingProfile.orgNicknames
            : {};
        const patch =
          typeof updateData.orgNicknames === 'object' ? updateData.orgNicknames : {};
        updateFields.orgNicknames = { ...prev, ...patch };
      }
      Object.assign(
        updateFields,
        writePiiPatch({
          bio: updateData.bio,
          phone: updateData.phone,
          location: updateData.location,
          dateOfBirth: updateData.dateOfBirth,
        })
      );

      const userProfile = await UserProfile.findOneAndUpdate(
        { userId },
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      if (!userProfile) {
        throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
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
      throw error;
    }
  }

  // Cập nhật status
  async updateStatus(userId, status) {
    try {
      const userProfile = await UserProfile.findOne({ userId });
      if (!userProfile) {
        throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
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
      throw error;
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
      throw error;
    }
  }

  // Tìm user profile theo số điện thoại (plaintext hoặc phoneBlindIndex khi PII mã hóa)
  async getUserProfileByPhone(phone) {
    try {
      const normalized = String(phone || '').trim();
      if (!normalized) return null;

      let userProfile = await UserProfile.findOne({ phone: normalized, isActive: true });
      if (!userProfile) {
        const blind = phoneBlindIndex(normalized);
        if (blind) {
          userProfile = await UserProfile.findOne({ phoneBlindIndex: blind, isActive: true });
        }
      }
      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile by phone:', error);
      throw error;
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
        throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
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
      throw error;
    }
  }
}

module.exports = new UserService();

