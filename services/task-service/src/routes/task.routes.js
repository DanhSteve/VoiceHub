const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');

// Tạo task mới
router.post('/', taskController.createTask.bind(taskController));

// Lấy danh sách tasks
router.get('/', taskController.getTasks.bind(taskController));

// Thống kê theo organization (đặt trước /:taskId — tránh khớp taskId = "statistics")
router.get('/statistics', taskController.getStatistics.bind(taskController));

// Tạo task từ file chat (async queue)
router.post('/from-chat-file', taskController.createTaskFromChatFile.bind(taskController));

// Lấy task theo ID
router.get('/:taskId', taskController.getTaskById.bind(taskController));

// Cập nhật task
router.patch('/:taskId', taskController.updateTask.bind(taskController));
router.put('/:taskId', taskController.updateTask.bind(taskController));

// Thêm comment
router.post('/:taskId/comments', taskController.addComment.bind(taskController));

// Xóa task
router.delete('/:taskId', taskController.deleteTask.bind(taskController));

module.exports = router;



