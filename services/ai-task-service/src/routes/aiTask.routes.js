const express = require('express');
const axios = require('axios');
const AiTaskExtraction = require('../models/AiTaskExtraction');
const SyncSuggestion = require('../models/SyncSuggestion');
const { publishJson } = require('../messaging/rabbit');

const router = express.Router();

/**
 * MVP async extract:
 * - tạo extraction status=queued
 * - publish job vào queue task-ai.extract
 */
router.post('/extract', async (req, res) => {
  const { messageId, organizationId, titleHint } = req.body || {};

  // Phase 2: auth sẽ đi qua API Gateway; tạm lấy userId từ header để test nội bộ
  const generatedBy = req.headers['x-user-id'] || req.headers['x-generated-by'];

  if (!generatedBy) return res.status(401).json({ success: false, message: 'Missing x-user-id' });
  if (!messageId || !organizationId) {
    return res.status(400).json({ success: false, message: 'messageId and organizationId are required' });
  }

  const extraction = await AiTaskExtraction.create({
    generatedBy,
    organizationId,
    status: 'queued',
    sourceRef: { messageId: String(messageId), messageType: 'chat_message' },
    draft: { title: titleHint || '' },
  });

  const queue = process.env.RABBITMQ_TASK_AI_EXTRACT_QUEUE || 'task-ai.extract';
  await publishJson(queue, {
    extractionId: String(extraction._id),
    messageId: String(messageId),
    organizationId: String(organizationId),
    generatedBy: String(generatedBy),
  });

  return res.status(202).json({ success: true, data: { extractionId: String(extraction._id), status: 'queued' } });
});

router.get('/extractions/:id', async (req, res) => {
  const extraction = await AiTaskExtraction.findById(req.params.id).lean();
  if (!extraction) return res.status(404).json({ success: false, message: 'Not found' });
  return res.json({ success: true, data: extraction });
});

/**
 * Confirm draft -> tạo Task thật ở task-service.
 * Lưu ý: Task.sourceRef sẽ bổ sung ở Phase 3 (schema Task mở rộng).
 */
router.post('/confirm', async (req, res) => {
  const { extractionId } = req.body || {};
  const userId = req.headers['x-user-id'];

  if (!userId) return res.status(401).json({ success: false, message: 'Missing x-user-id' });
  if (!extractionId) return res.status(400).json({ success: false, message: 'extractionId is required' });

  const extraction = await AiTaskExtraction.findById(extractionId);
  if (!extraction) return res.status(404).json({ success: false, message: 'Extraction not found' });
  if (!['ready', 'confirmed'].includes(extraction.status)) {
    return res.status(409).json({ success: false, message: `Extraction is not ready (status=${extraction.status})` });
  }

  if (extraction.status === 'confirmed' && extraction.taskId) {
    return res.json({ success: true, data: { taskId: String(extraction.taskId), extractionId: String(extraction._id) } });
  }

  const taskServiceUrl = (process.env.TASK_SERVICE_URL || 'http://task-service:3009').replace(/\/$/, '');
  const draft = extraction.draft || {};

  const createRes = await axios.post(
    `${taskServiceUrl}/api/tasks`,
    {
      title: draft.title || 'Task từ AI',
      description: draft.description || '',
      organizationId: String(extraction.organizationId),
      priority: draft.priority || 'medium',
      dueDate: draft.dueDate || null,
      tags: Array.isArray(draft.tags) ? draft.tags : [],
      assigneeId: draft.assigneeId || undefined,
    },
    {
      headers: { 'x-user-id': String(userId) },
      timeout: 15000,
      validateStatus: () => true,
    }
  );

  if (createRes.status !== 201 || !createRes.data?.success || !createRes.data?.data?._id) {
    const taskMsg =
      typeof createRes.data?.message === 'string' && createRes.data.message.trim()
        ? createRes.data.message.trim()
        : 'Create task failed';
    return res.status(400).json({
      success: false,
      message: taskMsg,
      details: { httpStatus: createRes.status, body: createRes.data },
    });
  }

  extraction.status = 'confirmed';
  extraction.taskId = createRes.data.data._id;
  await extraction.save();

  return res.json({ success: true, data: { taskId: String(extraction.taskId), extractionId: String(extraction._id) } });
});

router.get('/:taskId/sync-suggestions', async (req, res) => {
  const { taskId } = req.params;
  const items = await SyncSuggestion.find({ taskId, status: 'pending' }).sort({ createdAt: -1 }).lean();
  return res.json({ success: true, data: items });
});

router.post('/:taskId/sync-suggestions/:id/approve', async (req, res) => {
  const userId = req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ success: false, message: 'Missing x-user-id' });

  const suggestion = await SyncSuggestion.findById(req.params.id);
  if (!suggestion || String(suggestion.taskId) !== String(req.params.taskId)) {
    return res.status(404).json({ success: false, message: 'Suggestion not found' });
  }
  if (suggestion.status !== 'pending') {
    return res.status(409).json({ success: false, message: `Suggestion already ${suggestion.status}` });
  }

  const taskServiceUrl = (process.env.TASK_SERVICE_URL || 'http://task-service:3009').replace(/\/$/, '');
  const taskRes = await axios.get(`${taskServiceUrl}/api/tasks/${suggestion.taskId}`, {
    headers: { 'x-user-id': String(userId) },
    timeout: 15000,
    validateStatus: () => true,
  });
  const task = taskRes.data?.data;
  if (taskRes.status !== 200 || !taskRes.data?.success || !task) {
    return res.status(400).json({ success: false, message: 'Task not found', details: { httpStatus: taskRes.status } });
  }

  const lockedStatuses = new Set(['in_progress', 'review', 'done']);
  if (lockedStatuses.has(String(task.status))) {
    return res.status(409).json({ success: false, message: 'Task is locked for sync (status >= in_progress)' });
  }

  if (suggestion.changeType === 'deleted' || suggestion.changeType === 'recalled') {
    // approve -> detach source (không xóa task)
    await AiTaskExtraction.findByIdAndUpdate(suggestion.extractionId, { $set: { 'sync.isDetached': true } });
  } else {
    const patch = suggestion.proposedPatch || {};
    const updateRes = await axios.put(`${taskServiceUrl}/api/tasks/${suggestion.taskId}`, patch, {
      headers: { 'x-user-id': String(userId) },
      timeout: 15000,
      validateStatus: () => true,
    });
    if (updateRes.status !== 200 || !updateRes.data?.success) {
      return res.status(400).json({ success: false, message: 'Update task failed', details: updateRes.data });
    }
    await AiTaskExtraction.findByIdAndUpdate(suggestion.extractionId, { $set: { 'sync.lastSyncedAt': new Date() } });
  }

  suggestion.status = 'approved';
  suggestion.approvedBy = userId;
  await suggestion.save();
  return res.json({ success: true, data: suggestion });
});

module.exports = router;

