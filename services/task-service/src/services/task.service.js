const Task = require('../models/Task');
const { getRedisClient, taskWebhook, logger } = require('/shared');
const axios = require('axios');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:3004';
const ORGANIZATION_SERVICE_URL = process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013';

class TaskService {
  // Tạo task mới
  async createTask(taskData) {
    try {
      const {
        title,
        description,
        assigneeId,
        createdBy,
        serverId,
        organizationId,
        priority,
        dueDate,
        tags,
      } = taskData;

      // Kiểm tra organization — organization-service yêu cầu x-user-id (protect) + membership
      if (organizationId) {
        const orgRes = await axios.get(`${ORGANIZATION_SERVICE_URL}/api/organizations/${organizationId}`, {
          headers: { 'x-user-id': String(createdBy) },
          timeout: 15000,
          validateStatus: () => true,
        });
        if (orgRes.status === 401) {
          throw new Error('Cannot verify organization (missing or invalid user context)');
        }
        if (orgRes.status === 403) {
          throw new Error('You are not a member of this organization');
        }
        if (orgRes.status === 404) {
          throw new Error('Organization not found');
        }
        if (orgRes.status !== 200) {
          throw new Error('Cannot verify organization');
        }
      }

      // Kiểm tra assigneeId nếu có
      if (assigneeId) {
        const userRes = await axios.get(`${USER_SERVICE_URL}/api/users/${assigneeId}`, {
          timeout: 15000,
          validateStatus: () => true,
        });
        if (userRes.status !== 200 || !userRes.data?.success) {
          throw new Error('Assignee user not found');
        }
      }

      const task = new Task({
        title,
        description,
        assigneeId,
        createdBy,
        serverId,
        organizationId,
        priority: priority || 'medium',
        dueDate,
        tags: tags || [],
      });

      await task.save();

      // Gửi webhook
      if (assigneeId) {
        await taskWebhook.created(
          task._id.toString(),
          task.title,
          createdBy.toString(),
          assigneeId.toString(),
          organizationId?.toString()
        );
      }

      logger.info(`Task created: ${task._id}`);
      return task;
    } catch (error) {
      logger.error('Error creating task:', error);
      throw new Error(`Error creating task: ${error.message}`);
    }
  }

  // Lấy task theo ID
  async getTaskById(taskId) {
    try {
      // Không populate User (không có model User đăng ký trong task-service).
      const task = await Task.findById(taskId);

      return task;
    } catch (error) {
      logger.error('Error getting task:', error);
      throw new Error(`Error getting task: ${error.message}`);
    }
  }

  // Lấy danh sách tasks
  async getTasks(filter, options = {}) {
    try {
      const { page = 1, limit = 50, sort: sortOption } = options;
      const sort = sortOption || { createdAt: -1 };

      // Không populate User: task-service không đăng ký model User — populate gây MissingSchemaError → 500
      // (dashboard, lịch, danh sách task chỉ cần id + title + dueDate + status).
      const tasks = await Task.find(filter)
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean();

      const total = await Task.countDocuments(filter);

      return {
        tasks,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };
    } catch (error) {
      logger.error('Error getting tasks:', error);
      throw new Error(`Error getting tasks: ${error.message}`);
    }
  }

  // Cập nhật task
  async updateTask(taskId, updateData, userId) {
    try {
      const task = await Task.findById(taskId);

      if (!task) {
        throw new Error('Task not found');
      }

      // Chỉ creator hoặc assignee mới được cập nhật
      if (
        task.createdBy.toString() !== userId.toString() &&
        (!task.assigneeId || task.assigneeId.toString() !== userId.toString())
      ) {
        throw new Error('Only creator or assignee can update task');
      }

      const allowedFields = [
        'title',
        'description',
        'assigneeId',
        'status',
        'priority',
        'dueDate',
        'tags',
        'attachments',
      ];
      const updateFields = {};

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      }

      if (updateFields.attachments !== undefined) {
        const arr = Array.isArray(updateFields.attachments) ? updateFields.attachments : [];
        updateFields.attachments = arr.map((a) => ({
          name: a?.name != null ? String(a.name).slice(0, 500) : 'file',
          url: a?.url != null ? String(a.url) : '',
          ...(a?.documentId ? { documentId: a.documentId } : {}),
        }));
      }

      // Nếu status là done, set completedAt
      if (updateFields.status === 'done' && task.status !== 'done') {
        updateFields.completedAt = new Date();
      } else if (updateFields.status !== 'done' && task.status === 'done') {
        updateFields.completedAt = null;
      }

      const updated = await Task.findByIdAndUpdate(
        taskId,
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      logger.info(`Task updated: ${taskId}`);
      return updated;
    } catch (error) {
      logger.error('Error updating task:', error);
      throw new Error(`Error updating task: ${error.message}`);
    }
  }

  // Xóa task
  async deleteTask(taskId, userId) {
    try {
      const task = await Task.findById(taskId);

      if (!task) {
        throw new Error('Task not found');
      }

      // Chỉ creator mới được xóa
      if (task.createdBy.toString() !== userId.toString()) {
        throw new Error('Only creator can delete task');
      }

      // Soft delete
      task.isActive = false;
      await task.save();

      logger.info(`Task deleted: ${taskId}`);
      return task;
    } catch (error) {
      logger.error('Error deleting task:', error);
      throw new Error(`Error deleting task: ${error.message}`);
    }
  }

  // Thêm comment
  async addComment(taskId, userId, content) {
    try {
      const task = await Task.findById(taskId);

      if (!task) {
        throw new Error('Task not found');
      }

      task.comments.push({
        userId,
        content,
        createdAt: new Date(),
      });

      await task.save();

      logger.info(`Comment added to task: ${taskId}`);
      return task;
    } catch (error) {
      logger.error('Error adding comment:', error);
      throw new Error(`Error adding comment: ${error.message}`);
    }
  }
}

module.exports = new TaskService();

