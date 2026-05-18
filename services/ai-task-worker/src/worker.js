const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const amqp = require('amqplib');
const axios = require('axios');
const { connectDB, disconnectDB } = require('/shared');
const AiTaskExtraction = require('./models/AiTaskExtraction');
const SyncSuggestion = require('./models/SyncSuggestion');

const EXTRACT_QUEUE = process.env.RABBITMQ_TASK_AI_EXTRACT_QUEUE || 'task-ai.extract';
const SYNC_QUEUE = process.env.RABBITMQ_TASK_AI_SYNC_QUEUE || 'task-ai.sync';
const DLQ_QUEUE = process.env.RABBITMQ_TASK_AI_DLQ_QUEUE || 'task-ai.dlq';
const MAX_AI_JOB_RETRIES = Math.max(0, parseInt(process.env.AI_TASK_JOB_MAX_RETRIES || '8', 10) || 8);
const WORKER_MODE = String(process.env.AI_TASK_WORKER_MODE || 'both').toLowerCase();

async function fetchChatMessage(messageId) {
  const chatUrl = (process.env.CHAT_SERVICE_URL || 'http://chat-service:3006').replace(/\/$/, '');
  const token = process.env.CHAT_INTERNAL_TOKEN || '';
  if (!token) throw new Error('CHAT_INTERNAL_TOKEN is not set');

  const res = await axios.get(`${chatUrl}/api/messages/internal/messages/${messageId}`, {
    headers: { 'x-internal-token': token },
    timeout: 15000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data?.data) throw new Error('Chat message not found');
  return res.data.data;
}

async function getSignedReadUrl(storagePath) {
  const chatUrl = (process.env.CHAT_SERVICE_URL || 'http://chat-service:3006').replace(/\/$/, '');
  const token = process.env.CHAT_INTERNAL_TOKEN || '';
  if (!token) throw new Error('CHAT_INTERNAL_TOKEN is not set');

  const res = await axios.get(`${chatUrl}/api/messages/internal/storage/signed-read`, {
    headers: { 'x-internal-token': token },
    params: { storagePath },
    timeout: 15000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data?.success || !res.data?.data?.url) {
    throw new Error('Signed read url failed');
  }
  return res.data.data.url;
}

async function runOcrByUrl(imageUrl) {
  const base = (process.env.PADDLEOCR_BASE_URL || '').replace(/\/$/, '');
  if (!base) return { text: '', raw: null };

  const res = await axios.get(`${base}/ocr/predict-by-url`, {
    params: { imageUrl },
    timeout: 60000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || res.data?.resultcode !== 200) {
    throw new Error(`OCR failed HTTP ${res.status}`);
  }
  const items = res.data?.data || [];
  const texts = [];
  for (const it of items) {
    const rec = it?.rec_texts || [];
    if (Array.isArray(rec)) texts.push(...rec.map((x) => String(x || '').trim()).filter(Boolean));
  }
  return { text: texts.join('\n'), raw: res.data };
}

async function callOllama(prompt) {
  if (String(process.env.LLM_PROVIDER || 'ollama').toLowerCase() === 'mock') {
    return { response: JSON.stringify({ title: 'Mock task', description: prompt.slice(0, 200), priority: 'medium', dueDate: null }) };
  }
  const baseUrl = (process.env.OLLAMA_BASE_URL || 'http://ollama:11434').replace(/\/$/, '');
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b-instruct';

  const res = await axios.post(
    `${baseUrl}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      options: { temperature: 0.2 },
    },
    { timeout: 120000, validateStatus: () => true }
  );
  if (res.status < 200 || res.status >= 300) {
    let detail = '';
    if (res.data && typeof res.data === 'object' && typeof res.data.error === 'string') {
      detail = res.data.error;
    } else if (typeof res.data === 'string' && res.data.trim()) {
      detail = res.data.trim();
    }
    const pullHint =
      res.status === 404
        ? ` Gợi ý: chạy docker exec enterprise-ollama ollama pull ${model} (hoặc đặt OLLAMA_MODEL trùng một model đã có — xem ollama list trong container).`
        : '';
    throw new Error(
      detail ? `Ollama HTTP ${res.status}: ${detail}.${pullHint}` : `Ollama HTTP ${res.status}.${pullHint}`
    );
  }
  return res.data;
}

function buildHardcodedPrompt(messageText) {
  return [
    'Bạn là AI trích xuất task từ chat. Trả về DUY NHẤT JSON hợp lệ.',
    'Schema JSON:',
    '{ "title": string, "description": string, "priority": "low"|"medium"|"high"|"urgent", "dueDate": "YYYY-MM-DD"|null, "assigneeName": string|null, "tags": string[] }',
    '',
    'Chat:',
    messageText || '',
  ].join('\n');
}

function safeParseJsonFromOllama(data) {
  // Ollama thường trả { response: "...", ... }
  const text = typeof data?.response === 'string' ? data.response : JSON.stringify(data || {});
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('Model output has no JSON object');
  const jsonText = text.slice(start, end + 1);
  return JSON.parse(jsonText);
}

function computeConfidence(draft) {
  let score = 0.2;
  if (draft?.title && String(draft.title).trim().length >= 4) score += 0.35;
  if (draft?.description && String(draft.description).trim().length >= 10) score += 0.2;
  if (draft?.priority) score += 0.1;
  if (draft?.dueDate) score += 0.15;
  return Math.max(0, Math.min(1, score));
}

function validateDraft(draft) {
  const title = String(draft?.title || '').trim();
  if (!title) return { ok: false, message: 'Missing title' };
  if (title.length > 200) return { ok: false, message: 'Title too long' };
  return { ok: true };
}

async function resolveAssigneeId(assigneeName) {
  const q = String(assigneeName || '').trim();
  if (!q) return { assigneeId: null, note: '' };

  const userUrl = (process.env.USER_SERVICE_URL || 'http://user-service:3004').replace(/\/$/, '');
  const internalToken = String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim();
  if (!internalToken) {
    return { assigneeId: null, note: 'user_search_no_internal_token' };
  }

  const res = await axios.get(`${userUrl}/api/users/internal/search`, {
    params: { q, limit: 5 },
    headers: { 'x-internal-token': internalToken },
    timeout: 10000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data?.success) return { assigneeId: null, note: 'user_search_failed' };

  const users = res.data?.data?.users || [];
  if (!Array.isArray(users) || users.length === 0) return { assigneeId: null, note: 'no_match' };

  const exact = users.find(
    (u) => String(u.displayName || '').toLowerCase() === q.toLowerCase() || String(u.username || '').toLowerCase() === q.toLowerCase()
  );
  const picked = exact || users[0];
  return { assigneeId: picked.userId || picked._id || null, note: exact ? 'exact' : 'first' };
}

function buildPatchFromDraft(nextDraft) {
  const patch = {};
  if (nextDraft.title) patch.title = nextDraft.title;
  if (nextDraft.description != null) patch.description = nextDraft.description;
  if (nextDraft.priority) patch.priority = nextDraft.priority;
  if (nextDraft.dueDate !== undefined) patch.dueDate = nextDraft.dueDate;
  if (Array.isArray(nextDraft.tags)) patch.tags = nextDraft.tags;
  if (nextDraft.assigneeId) patch.assigneeId = nextDraft.assigneeId;
  return patch;
}

async function createSyncSuggestion({ extraction, messageId, changeType, proposedPatch }) {
  const exists = await SyncSuggestion.findOne({
    taskId: extraction.taskId,
    messageId: String(messageId),
    changeType,
    status: 'pending',
  }).lean();
  if (exists) return;

  await SyncSuggestion.create({
    taskId: extraction.taskId,
    extractionId: extraction._id,
    organizationId: extraction.organizationId,
    messageId: String(messageId),
    changeType,
    status: 'pending',
    proposedPatch: proposedPatch || {},
    createdBy: extraction.generatedBy,
  });
}

async function fetchTask(taskId, userId) {
  const taskUrl = (process.env.TASK_SERVICE_URL || 'http://task-service:3009').replace(/\/$/, '');
  const res = await axios.get(`${taskUrl}/api/tasks/${taskId}`, {
    headers: userId ? { 'x-user-id': String(userId) } : undefined,
    timeout: 15000,
    validateStatus: () => true,
  });
  if (res.status !== 200 || !res.data?.success || !res.data?.data) return null;
  return res.data.data;
}

async function processExtractJob(payload) {
  const { extractionId } = payload || {};
  if (!extractionId) throw new Error('Missing extractionId');

  const extraction = await AiTaskExtraction.findById(extractionId);
  if (!extraction) throw new Error('Extraction not found');

  try {
    extraction.status = 'processing';
    extraction.error = '';
    await extraction.save();

    const msg = await fetchChatMessage(extraction.sourceRef?.messageId);
    const messageText = String(msg?.content || '').trim();
    const attachmentHint = msg?.fileMeta?.originalName ? `\nĐính kèm: ${msg.fileMeta.originalName}` : '';

    let ocrText = '';
    if (String(msg?.messageType) === 'image' && msg?.fileMeta?.storagePath && process.env.PADDLEOCR_BASE_URL) {
      const signedUrl = await getSignedReadUrl(String(msg.fileMeta.storagePath));
      const ocr = await runOcrByUrl(signedUrl);
      ocrText = ocr.text ? `\nOCR:\n${ocr.text}` : '';
    }

    const prompt = buildHardcodedPrompt(`${messageText}${attachmentHint}${ocrText}`);
    const modelData = await callOllama(prompt);
    const parsed = safeParseJsonFromOllama(modelData);

    const draft = {
      title: parsed.title || extraction.draft?.title || '',
      description: parsed.description || '',
      priority: parsed.priority || 'medium',
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      assigneeName: parsed.assigneeName || null,
    };

    const assignee = await resolveAssigneeId(draft.assigneeName);
    if (assignee.assigneeId) {
      draft.assigneeId = assignee.assigneeId;
    }

    const validation = validateDraft(draft);
    if (!validation.ok) throw new Error(`Invalid draft: ${validation.message}`);

    extraction.status = 'ready';
    extraction.rawModelOutput = modelData;
    extraction.draft = draft;
    extraction.confidence = computeConfidence(draft);
    await extraction.save();
  } catch (err) {
    extraction.status = 'failed';
    extraction.error = err.message || String(err);
    await extraction.save();
    throw err;
  }
}

async function processSyncJob(payload) {
  const messageId = payload?.messageId;
  const changeType = payload?.changeType;
  if (!messageId || !changeType) throw new Error('Missing messageId/changeType');

  const extractions = await AiTaskExtraction.find({
    'sourceRef.messageId': String(messageId),
    status: 'confirmed',
    taskId: { $ne: null },
    'sync.isDetached': { $ne: true },
  });

  for (const extraction of extractions) {
    if (extraction?.sync?.isLocked) continue;

    const task = await fetchTask(extraction.taskId, extraction.generatedBy);
    if (!task) continue;
    const lockedStatuses = new Set(['in_progress', 'review', 'done']);
    if (lockedStatuses.has(String(task.status))) {
      extraction.sync = { ...(extraction.sync || {}), isLocked: true };
      await extraction.save();
      continue;
    }

    if (changeType === 'deleted' || changeType === 'recalled') {
      await createSyncSuggestion({ extraction, messageId, changeType, proposedPatch: {} });
      continue;
    }

    // edited: re-analyze -> suggestion patch
    const msg = await fetchChatMessage(String(messageId));
    const messageText = String(msg?.content || '').trim();
    const attachmentHint = msg?.fileMeta?.originalName ? `\nĐính kèm: ${msg.fileMeta.originalName}` : '';

    let ocrText = '';
    if (String(msg?.messageType) === 'image' && msg?.fileMeta?.storagePath && process.env.PADDLEOCR_BASE_URL) {
      const signedUrl = await getSignedReadUrl(String(msg.fileMeta.storagePath));
      const ocr = await runOcrByUrl(signedUrl);
      ocrText = ocr.text ? `\nOCR:\n${ocr.text}` : '';
    }

    const prompt = buildHardcodedPrompt(`${messageText}${attachmentHint}${ocrText}`);
    const modelData = await callOllama(prompt);
    const parsed = safeParseJsonFromOllama(modelData);

    const draft = {
      title: parsed.title || '',
      description: parsed.description || '',
      priority: parsed.priority || 'medium',
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      assigneeName: parsed.assigneeName || null,
    };
    const assignee = await resolveAssigneeId(draft.assigneeName);
    if (assignee.assigneeId) draft.assigneeId = assignee.assigneeId;

    const validation = validateDraft(draft);
    if (!validation.ok) continue;

    const patch = buildPatchFromDraft(draft);
    await createSyncSuggestion({ extraction, messageId, changeType, proposedPatch: patch });
  }
}

function getRetryCount(msg) {
  const h = (msg && msg.properties && msg.properties.headers) || {};
  const n = h['x-retry-count'];
  if (n === undefined || n === null) return 0;
  const parsed = parseInt(String(n), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function publishToDlq(ch, sourceQueue, msg, err) {
  const original = msg.content.toString('utf8');
  const body = {
    sourceQueue,
    error: String(err && err.message ? err.message : err),
    transient: isTransientJobError(err),
    original,
  };
  await ch.assertQueue(DLQ_QUEUE, { durable: true });
  ch.sendToQueue(DLQ_QUEUE, Buffer.from(JSON.stringify(body)), {
    persistent: true,
    contentType: 'application/json',
  });
}

function isTransientJobError(err) {
  const code = err && err.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') return true;
  const status = err && err.response && err.response.status;
  if (status >= 500) return true;
  const msg = String(err && err.message ? err.message : err);
  if (/timeout|ETIMEDOUT|MongoNetworkError/i.test(msg)) return true;
  return false;
}

async function start() {
  const mongoUri = (process.env.AI_TASK_MONGODB_URI || '').trim() || process.env.MONGODB_URI;
  await connectDB(mongoUri);

  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL is not set');

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertQueue(EXTRACT_QUEUE, { durable: true });
  await ch.assertQueue(SYNC_QUEUE, { durable: true });
  await ch.assertQueue(DLQ_QUEUE, { durable: true });
  await ch.prefetch(1);

  let extractConsumerTag = null;
  let syncConsumerTag = null;

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      if (extractConsumerTag) await ch.cancel(extractConsumerTag);
    } catch (e) {
      /* ignore */
    }
    try {
      if (syncConsumerTag) await ch.cancel(syncConsumerTag);
    } catch (e) {
      /* ignore */
    }
    try {
      await ch.close();
    } catch (e) {
      /* ignore */
    }
    try {
      await conn.close();
    } catch (e) {
      /* ignore */
    }
    try {
      await disconnectDB();
    } catch (e) {
      /* ignore */
    }
    process.exit(0);
  };

  const shouldConsumeExtract = WORKER_MODE === 'extract' || WORKER_MODE === 'both';
  const shouldConsumeSync = WORKER_MODE === 'sync' || WORKER_MODE === 'both';
  if (!shouldConsumeExtract && !shouldConsumeSync) {
    throw new Error(`Invalid AI_TASK_WORKER_MODE=${WORKER_MODE}. Expected extract|sync|both`);
  }

  if (shouldConsumeExtract) {
    console.log(`[ai-task-worker] listening queue=${EXTRACT_QUEUE} mode=${WORKER_MODE}`);
    const extractConsume = await ch.consume(
      EXTRACT_QUEUE,
      async (msg) => {
        if (!msg) return;
        const retryCount = getRetryCount(msg);
        try {
          const payload = JSON.parse(msg.content.toString('utf8'));
          await processExtractJob(payload);
          ch.ack(msg);
        } catch (err) {
          console.error('[ai-task-worker] extract job failed:', err.message);
          const transient = isTransientJobError(err);
          if (transient && retryCount < MAX_AI_JOB_RETRIES) {
            ch.sendToQueue(EXTRACT_QUEUE, msg.content, {
              persistent: true,
              contentType: 'application/json',
              headers: { 'x-retry-count': retryCount + 1 },
            });
            ch.ack(msg);
            return;
          }
          try {
            await publishToDlq(ch, EXTRACT_QUEUE, msg, err);
          } catch (dlqErr) {
            console.error('[ai-task-worker] extract DLQ publish failed:', dlqErr.message);
          }
          ch.ack(msg);
        }
      },
      { noAck: false }
    );
    extractConsumerTag = extractConsume.consumerTag;
  }

  if (shouldConsumeSync) {
    console.log(`[ai-task-worker] listening queue=${SYNC_QUEUE} mode=${WORKER_MODE}`);
    const syncConsume = await ch.consume(
      SYNC_QUEUE,
      async (msg) => {
        if (!msg) return;
        const retryCount = getRetryCount(msg);
        try {
          const payload = JSON.parse(msg.content.toString('utf8'));
          await processSyncJob(payload);
          ch.ack(msg);
        } catch (err) {
          console.error('[ai-task-worker] sync job failed:', err.message);
          const transient = isTransientJobError(err);
          if (transient && retryCount < MAX_AI_JOB_RETRIES) {
            ch.sendToQueue(SYNC_QUEUE, msg.content, {
              persistent: true,
              contentType: 'application/json',
              headers: { 'x-retry-count': retryCount + 1 },
            });
            ch.ack(msg);
            return;
          }
          try {
            await publishToDlq(ch, SYNC_QUEUE, msg, err);
          } catch (dlqErr) {
            console.error('[ai-task-worker] sync DLQ publish failed:', dlqErr.message);
          }
          ch.ack(msg);
        }
      },
      { noAck: false }
    );
    syncConsumerTag = syncConsume.consumerTag;
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  conn.on('error', (err) => console.error('[ai-task-worker] conn error:', err.message));
  conn.on('close', () => console.error('[ai-task-worker] conn closed'));
}

start().catch((err) => {
  console.error('[ai-task-worker] fatal:', err);
  process.exit(1);
});

