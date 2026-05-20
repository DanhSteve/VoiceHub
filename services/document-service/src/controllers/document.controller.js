const { mongoose } = require('/shared/config/mongo');
const documentService = require('../services/document.service');
const Document = require('../models/Document');
const { logger } = require('/shared');

class DocumentController {
  // Tạo document mới
  async createDocument(req, res) {
    try {
      const {
        name,
        description,
        organizationId,
        serverId,
        fileUrl,
        fileSize,
        mimeType,
        tags,
        isPublic,
      } = req.body;
      const uploadedBy = req.user?.id || req.userContext?.userId;

      if (!name || !fileUrl || !uploadedBy) {
        return res.status(400).json({
          success: false,
          message: 'name, fileUrl and uploadedBy are required',
        });
      }

      const document = await documentService.createDocument({
        name,
        description,
        uploadedBy,
        organizationId,
        serverId,
        fileUrl,
        fileSize,
        mimeType,
        tags,
        isPublic,
      });

      res.status(201).json({
        success: true,
        data: document,
      });
    } catch (error) {
      logger.error('Create document error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy document theo ID
  async getDocumentById(req, res) {
    try {
      const { documentId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const document = await documentService.getDocumentById(documentId);

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found',
        });
      }

      const owner = String(document.uploadedBy || '') === String(userId);
      const allowed = owner || document.isPublic === true;
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden',
        });
      }

      res.json({
        success: true,
        data: document,
      });
    } catch (error) {
      logger.error('Get document error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy danh sách documents
  async getDocuments(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const { organizationId, serverId, uploadedBy, tags, isPublic, page, limit } = req.query;

      const filter = { isActive: true };

      if (organizationId) filter.organizationId = organizationId;
      if (serverId) filter.serverId = serverId;
      if (uploadedBy) {
        if (String(uploadedBy) !== String(userId)) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden',
          });
        }
        filter.uploadedBy = uploadedBy;
      }
      if (tags) filter.tags = { $in: tags.split(',') };
      if (isPublic !== undefined) filter.isPublic = isPublic === 'true';

      if (!organizationId && !serverId && !uploadedBy) {
        filter.uploadedBy = userId;
      }

      const result = await documentService.getDocuments(filter, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get documents error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Cập nhật document
  async updateDocument(req, res) {
    try {
      const { documentId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const document = await documentService.updateDocument(documentId, req.body, userId);

      res.json({
        success: true,
        data: document,
      });
    } catch (error) {
      logger.error('Update document error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Upload version mới
  async uploadNewVersion(req, res) {
    try {
      const { documentId } = req.params;
      const { fileUrl, fileSize, mimeType } = req.body;
      const userId = req.user?.id || req.userContext?.userId;

      if (!fileUrl || !userId) {
        return res.status(400).json({
          success: false,
          message: 'fileUrl and userId are required',
        });
      }

      const document = await documentService.uploadNewVersion(
        documentId,
        fileUrl,
        fileSize,
        mimeType,
        userId
      );

      res.json({
        success: true,
        data: document,
      });
    } catch (error) {
      logger.error('Upload new version error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa document
  async deleteDocument(req, res) {
    try {
      const { documentId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const document = await documentService.deleteDocument(documentId, userId);

      res.json({
        success: true,
        message: 'Document deleted successfully',
        data: document,
      });
    } catch (error) {
      logger.error('Delete document error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /** Gọi nội bộ — xóa mọi document thuộc tổ chức */
  async purgeOrganizationDocuments(req, res) {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
          success: false,
          message: 'MongoDB is not ready in document-service',
        });
      }
      const { organizationId } = req.params;
      if (!mongoose.Types.ObjectId.isValid(String(organizationId))) {
        return res.status(400).json({ success: false, message: 'Invalid organizationId' });
      }
      const oid = new mongoose.Types.ObjectId(String(organizationId));
      const result = await Document.deleteMany({ organizationId: oid });
      return res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
      logger.error('purgeOrganizationDocuments error:', error);
      return res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new DocumentController();

