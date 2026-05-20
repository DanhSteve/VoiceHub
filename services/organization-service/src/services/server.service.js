const Server = require('../models/Server');
const { getRedisClient, organizationWebhook, logger, fetchUserProfileByIdInternal } = require('/shared');

class ServerService {
  // Tạo server mới
  async createServer(serverData) {
    try {
      const { name, description, organizationId, ownerId, icon, isPublic } = serverData;

      // Kiểm tra organization tồn tại
      const organization = await this.getOrganizationById(organizationId);
      if (!organization) {
        throw new Error('Organization not found');
      }

      // Kiểm tra ownerId có tồn tại không
      try {
        await fetchUserProfileByIdInternal(ownerId);
      } catch (error) {
        throw new Error('Owner user not found');
      }

      const server = new Server({
        name,
        description,
        organizationId,
        ownerId,
        icon,
        isPublic: isPublic || false,
        members: [
          {
            userId: ownerId,
            role: 'owner',
            joinedAt: new Date(),
          },
        ],
      });

      await server.save();

      // Cache server
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `server:${server._id}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(server));
      }

      logger.info(`Server created: ${server._id}`);
      return server;
    } catch (error) {
      logger.error('Error creating server:', error);
      throw new Error(`Error creating server: ${error.message}`);
    }
  }

  // Lấy server theo ID
  async getServerById(serverId) {
    try {
      // Kiểm tra cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `server:${serverId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const server = await Server.findById(serverId)
        .populate('organizationId', 'name')
        .populate('ownerId', 'username displayName avatar')
        .populate('members.userId', 'username displayName avatar');

      // Cache server
      if (redis && server) {
        const cacheKey = `server:${serverId}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(server));
      }

      return server;
    } catch (error) {
      logger.error('Error getting server:', error);
      throw new Error(`Error getting server: ${error.message}`);
    }
  }

  // Lấy danh sách servers trong organization
  async getServersByOrganization(organizationId, options = {}) {
    try {
      const { page = 1, limit = 50 } = options;

      const servers = await Server.find({
        organizationId,
        isActive: true,
      })
        .populate('ownerId', 'username displayName avatar')
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ createdAt: -1 });

      const total = await Server.countDocuments({ organizationId, isActive: true });

      return {
        servers,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };
    } catch (error) {
      logger.error('Error getting servers:', error);
      throw new Error(`Error getting servers: ${error.message}`);
    }
  }

  // Thêm member vào server
  async addMember(serverId, userId, role = 'member') {
    try {
      const server = await Server.findById(serverId);

      if (!server) {
        throw new Error('Server not found');
      }

      // Kiểm tra user đã là member chưa
      const existingMember = server.members.find(
        (m) => m.userId.toString() === userId.toString()
      );

      if (existingMember) {
        throw new Error('User is already a member');
      }

      // Kiểm tra userId có tồn tại không
      try {
        await fetchUserProfileByIdInternal(userId);
      } catch (error) {
        throw new Error('User not found');
      }

      server.members.push({
        userId,
        role,
        joinedAt: new Date(),
      });

      await server.save();

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `server:${serverId}`;
        await redis.del(cacheKey);
      }

      logger.info(`Member added to server: ${serverId}, user: ${userId}`);
      return server;
    } catch (error) {
      logger.error('Error adding member:', error);
      throw new Error(`Error adding member: ${error.message}`);
    }
  }

  // Xóa member khỏi server
  async removeMember(serverId, userId) {
    try {
      const server = await Server.findById(serverId);

      if (!server) {
        throw new Error('Server not found');
      }

      // Không cho phép xóa owner
      if (server.ownerId.toString() === userId.toString()) {
        throw new Error('Cannot remove server owner');
      }

      server.members = server.members.filter(
        (m) => m.userId.toString() !== userId.toString()
      );

      await server.save();

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `server:${serverId}`;
        await redis.del(cacheKey);
      }

      logger.info(`Member removed from server: ${serverId}, user: ${userId}`);
      return server;
    } catch (error) {
      logger.error('Error removing member:', error);
      throw new Error(`Error removing member: ${error.message}`);
    }
  }

  // Cập nhật server
  async updateServer(serverId, updateData, userId) {
    try {
      const server = await Server.findById(serverId);

      if (!server) {
        throw new Error('Server not found');
      }

      // Chỉ owner hoặc admin mới được cập nhật
      const member = server.members.find((m) => m.userId.toString() === userId.toString());
      if (
        server.ownerId.toString() !== userId.toString() &&
        (!member || !['owner', 'admin'].includes(member.role))
      ) {
        throw new Error('Only owner or admin can update server');
      }

      const allowedFields = ['name', 'description', 'icon', 'isPublic'];
      const updateFields = {};

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      }

      const updated = await Server.findByIdAndUpdate(
        serverId,
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `server:${serverId}`;
        await redis.del(cacheKey);
      }

      logger.info(`Server updated: ${serverId}`);
      return updated;
    } catch (error) {
      logger.error('Error updating server:', error);
      throw new Error(`Error updating server: ${error.message}`);
    }
  }

  // Xóa server
  async deleteServer(serverId, userId) {
    try {
      const server = await Server.findById(serverId);

      if (!server) {
        throw new Error('Server not found');
      }

      // Chỉ owner mới được xóa
      if (server.ownerId.toString() !== userId.toString()) {
        throw new Error('Only owner can delete server');
      }

      // Soft delete
      server.isActive = false;
      await server.save();

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `server:${serverId}`;
        await redis.del(cacheKey);
      }

      logger.info(`Server deleted: ${serverId}`);
      return server;
    } catch (error) {
      logger.error('Error deleting server:', error);
      throw new Error(`Error deleting server: ${error.message}`);
    }
  }

  // Helper: Lấy organization (để tránh circular dependency)
  async getOrganizationById(organizationId) {
    const Organization = require('../models/Organization');
    return await Organization.findById(organizationId);
  }
}

module.exports = new ServerService();

