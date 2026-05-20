const Document = require('../models/Document');
const { getRedisClient, logger, fetchUserProfileByIdInternal } = require('/shared');

class DocumentService {
  // Tạo document mới
  async createDocument(documentData) {
    try {
      const {
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
      } = documentData;

      // Kiểm tra uploadedBy có tồn tại không
      try {
        await fetchUserProfileByIdInternal(uploadedBy);
      } catch (error) {
        throw new Error('Uploader user not found');
      }

      const document = new Document({
        name,
        description,
        uploadedBy,
        organizationId,
        serverId,
        fileUrl,
        fileSize,
        mimeType,
        tags: tags || [],
        isPublic: isPublic || false,
        version: 1,
      });

      await document.save();

      logger.info(`Document created: ${document._id}`);
      return document;
    } catch (error) {
      logger.error('Error creating document:', error);
      throw new Error(`Error creating document: ${error.message}`);
    }
  }

  // Lấy document theo ID
  async getDocumentById(documentId) {
    try {
      const document = await Document.findById(documentId).populate(
        'uploadedBy',
        'username displayName avatar'
      );

      return document;
    } catch (error) {
      logger.error('Error getting document:', error);
      throw new Error(`Error getting document: ${error.message}`);
    }
  }

  // Lấy danh sách documents
  async getDocuments(filter, options = {}) {
    try {
      const { page = 1, limit = 50, sort = { createdAt: -1 } } = options;

      const documents = await Document.find(filter)
        .populate('uploadedBy', 'username displayName avatar')
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Document.countDocuments(filter);

      return {
        documents,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };
    } catch (error) {
      logger.error('Error getting documents:', error);
      throw new Error(`Error getting documents: ${error.message}`);
    }
  }

  // Cập nhật document
  async updateDocument(documentId, updateData, userId) {
    try {
      const document = await Document.findById(documentId);

      if (!document) {
        throw new Error('Document not found');
      }

      // Chỉ uploader mới được cập nhật
      if (document.uploadedBy.toString() !== userId.toString()) {
        throw new Error('Only uploader can update document');
      }

      const allowedFields = ['name', 'description', 'tags', 'isPublic'];
      const updateFields = {};

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      }

      const updated = await Document.findByIdAndUpdate(
        documentId,
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      logger.info(`Document updated: ${documentId}`);
      return updated;
    } catch (error) {
      logger.error('Error updating document:', error);
      throw new Error(`Error updating document: ${error.message}`);
    }
  }

  // Upload version mới
  async uploadNewVersion(documentId, fileUrl, fileSize, mimeType, userId) {
    try {
      const document = await Document.findById(documentId);

      if (!document) {
        throw new Error('Document not found');
      }

      // Chỉ uploader mới được upload version mới
      if (document.uploadedBy.toString() !== userId.toString()) {
        throw new Error('Only uploader can upload new version');
      }

      // Lưu version cũ
      document.previousVersions.push({
        fileUrl: document.fileUrl,
        version: document.version,
        uploadedAt: document.updatedAt,
      });

      // Cập nhật version mới
      document.fileUrl = fileUrl;
      document.fileSize = fileSize;
      document.mimeType = mimeType;
      document.version += 1;

      await document.save();

      logger.info(`New version uploaded for document: ${documentId}, version: ${document.version}`);
      return document;
    } catch (error) {
      logger.error('Error uploading new version:', error);
      throw new Error(`Error uploading new version: ${error.message}`);
    }
  }

  // Xóa document
  async deleteDocument(documentId, userId) {
    try {
      const document = await Document.findById(documentId);

      if (!document) {
        throw new Error('Document not found');
      }

      // Chỉ uploader mới được xóa
      if (document.uploadedBy.toString() !== userId.toString()) {
        throw new Error('Only uploader can delete document');
      }

      // Soft delete
      document.isActive = false;
      await document.save();

      logger.info(`Document deleted: ${documentId}`);
      return document;
    } catch (error) {
      logger.error('Error deleting document:', error);
      throw new Error(`Error deleting document: ${error.message}`);
    }
  }
}

module.exports = new DocumentService();

