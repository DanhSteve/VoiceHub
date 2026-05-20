const Organization = require('../models/Organization');
const { getRedisClient, organizationWebhook, logger, fetchUserProfileByIdInternal } = require('/shared');
const { ensureDefaultOrgRoles } = require('./rolePermissionOrgSync');
const { purgeOrganizationEverywhere } = require('./organizationCascadePurge');

class OrganizationService {
  // Tạo organization mới
  async createOrganization(organizationData) {
    try {
      const { name, description, ownerId, logo, settings } = organizationData;

      // Kiểm tra ownerId có tồn tại không (gọi user-service)
      try {
        await fetchUserProfileByIdInternal(ownerId);
      } catch (error) {
        throw new Error('Owner user not found');
      }

      const organization = new Organization({
        name,
        description,
        ownerId,
        logo,
        settings: settings || {},
      });

      await organization.save();

      await ensureDefaultOrgRoles(organization._id);

      // Cache organization
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `organization:${organization._id}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(organization));
      }

      // Gửi webhook
      try {
        await organizationWebhook.organizationCreated(
          organization._id.toString(),
          organization.name,
          ownerId.toString()
        );
      } catch (error) {
        logger.error('Error sending organization created webhook:', error);
      }

      logger.info(`Organization created: ${organization._id}`);
      return organization;
    } catch (error) {
      logger.error('Error creating organization:', error);
      throw new Error(`Error creating organization: ${error.message}`);
    }
  }

  // Lấy organization theo ID
  async getOrganizationById(organizationId) {
    try {
      // Kiểm tra cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `organization:${organizationId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const organization = await Organization.findById(organizationId)
        .populate('ownerId', 'username displayName avatar');

      // Cache organization
      if (redis && organization) {
        const cacheKey = `organization:${organizationId}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(organization));
      }

      return organization;
    } catch (error) {
      logger.error('Error getting organization:', error);
      throw new Error(`Error getting organization: ${error.message}`);
    }
  }

  // Cập nhật organization
  async updateOrganization(organizationId, updateData, userId) {
    try {
      const organization = await Organization.findById(organizationId);

      if (!organization) {
        throw new Error('Organization not found');
      }

      // Chỉ owner mới được cập nhật
      if (organization.ownerId.toString() !== userId.toString()) {
        throw new Error('Only owner can update organization');
      }

      const allowedFields = ['name', 'description', 'logo', 'settings'];
      const updateFields = {};

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      }

      const updated = await Organization.findByIdAndUpdate(
        organizationId,
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `organization:${organizationId}`;
        await redis.del(cacheKey);
      }

      logger.info(`Organization updated: ${organizationId}`);
      return updated;
    } catch (error) {
      logger.error('Error updating organization:', error);
      throw new Error(`Error updating organization: ${error.message}`);
    }
  }

  // Xóa organization (toàn bộ dữ liệu liên quan — dùng khi API legacy gọi trực tiếp service)
  async deleteOrganization(organizationId, userId) {
    try {
      const organization = await Organization.findById(organizationId);

      if (!organization) {
        throw new Error('Organization not found');
      }

      if (organization.ownerId.toString() !== userId.toString()) {
        throw new Error('Only owner can delete organization');
      }

      await purgeOrganizationEverywhere(organizationId);

      logger.info(`Organization and related data purged: ${organizationId}`);
      return { _id: organizationId, deleted: true };
    } catch (error) {
      logger.error('Error deleting organization:', error);
      throw new Error(`Error deleting organization: ${error.message}`);
    }
  }
}

module.exports = new OrganizationService();

