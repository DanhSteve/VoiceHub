const amqp = require('amqplib');
const axios = require('axios');
const Task = require('../models/Task');
const taskService = require('../services/task.service');
const { firebaseStorage, emitRealtimeEvent, logger } = require('/shared');

const QUEUE = process.env.RABBITMQ_TASK_FROM_FILE_QUEUE || 'voicehub.task.from_file';
const DLQ =
  process.env.RABBITMQ_TASK_FROM_FILE_DLQ_QUEUE || `${process.env.RABBITMQ_TASK_FROM_FILE_QUEUE || 'voicehub.task.from_file'}.dlq`;
const MAX_TRANSIENT_RETRIES = Math.max(
  0,
  parseInt(process.env.TASK_FROM_FILE_MAX_RETRIES || '8', 10) || 8
);

let workerHandle = null;

const CHAT_SERVICE_URL = (process.env.CHAT_SERVICE_URL || 'http://chat-service:3006').replace(/\/$/, '');
const CHAT_INTERNAL_TOKEN = process.env.CHAT_INTERNAL_TOKEN || '';

async function promoteChatMessage(messageId, taskId) {
  if (!CHAT_INTERNAL_TOKEN) {
    throw new Error('CHAT_INTERNAL_TOKEN is not set');
  }
  const url = `${CHAT_SERVICE_URL}/api/messages/internal/messages/${messageId}/file-promoted`;
  const res = await axios.patch(
    url,
    { taskId: String(taskId) },
    {
      headers: {
        'x-internal-token': CHAT_INTERNAL_TOKEN,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`promote message failed: HTTP ${res.status}`);
  }
}

async function processJob(payload) {
  const {
    messageId,
    userId,
    organizationId,
    title,
    storagePath,
    originalName,
  } = payload;

  if (!firebaseStorage.isEnabled()) {
    throw new Error('Firebase Storage not configured');
  }

  let task = null;
  try {
    task = await taskService.createTask({
      title: title || 'Task từ file',
      description: 'Tạo từ file đính kèm trong chat',
      createdBy: userId,
      organizationId,
    });

    const safeName = firebaseStorage.sanitizeFileName(originalName || 'file');
    const destPath = `tasks/${String(organizationId)}/${String(task._id)}/${safeName}`;

    await firebaseStorage.copyObject(storagePath, destPath);

    const { url } = await firebaseStorage.getSignedReadUrl(destPath);

    await Task.findByIdAndUpdate(task._id, {
      $set: {
        attachments: [{ name: originalName || safeName, url }],
      },
    });

    await promoteChatMessage(messageId, task._id);

    try {
      await firebaseStorage.deleteObject(storagePath);
    } catch (e) {
      logger.warn(`[taskFromFileWorker] temp delete ${storagePath}: ${e.message}`);
    }

    await emitRealtimeEvent({
      event: 'task:created_from_file',
      userId: String(userId),
      payload: {
        taskId: String(task._id),
        messageId: String(messageId),
        organizationId: String(organizationId),
      },
    });
  } catch (err) {
    if (task?._id) {
      try {
        await Task.findByIdAndUpdate(task._id, { isActive: false });
      } catch {
        /* ignore */
      }
    }
    throw err;
  }
}

function isTransientWorkerError(err) {
  const code = err && err.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') return true;
  const status = err && err.response && err.response.status;
  if (status >= 500) return true;
  return false;
}

function getRetryCount(msg) {
  const h = (msg && msg.properties && msg.properties.headers) || {};
  const n = h['x-retry-count'];
  if (n === undefined || n === null) return 0;
  const parsed = parseInt(String(n), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function publishToDlq(ch, msg, err) {
  const original = msg.content.toString('utf8');
  const body = {
    error: String(err && err.message ? err.message : err),
    transient: isTransientWorkerError(err),
    original,
  };
  await ch.assertQueue(DLQ, { durable: true });
  ch.sendToQueue(DLQ, Buffer.from(JSON.stringify(body)), {
    persistent: true,
    contentType: 'application/json',
  });
}

async function startTaskFromFileWorker() {
  const url = process.env.RABBITMQ_URL;
  if (!url || process.env.TASK_FROM_FILE_WORKER === 'false') {
    console.log('[taskFromFileWorker] skipped');
    return;
  }

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertQueue(QUEUE, { durable: true });
  await ch.assertQueue(DLQ, { durable: true });

  const { consumerTag } = await ch.consume(
    QUEUE,
    async (msg) => {
      if (!msg) return;
      const retryCount = getRetryCount(msg);
      try {
        const payload = JSON.parse(msg.content.toString('utf8'));
        await processJob(payload);
        ch.ack(msg);
      } catch (err) {
        logger.error('[taskFromFileWorker]', err.message);
        const transient = isTransientWorkerError(err);
        if (transient && retryCount < MAX_TRANSIENT_RETRIES) {
          const next = retryCount + 1;
          ch.sendToQueue(QUEUE, msg.content, {
            persistent: true,
            contentType: 'application/json',
            headers: { 'x-retry-count': next },
          });
          ch.ack(msg);
          return;
        }
        try {
          await publishToDlq(ch, msg, err);
        } catch (dlqErr) {
          logger.error('[taskFromFileWorker] DLQ publish failed', dlqErr.message);
        }
        ch.ack(msg);
      }
    },
    { noAck: false }
  );

  conn.on('error', (err) => logger.error('[taskFromFileWorker] conn', err.message));
  console.log(`[taskFromFileWorker] listening on ${QUEUE}`);
  workerHandle = { conn, ch, consumerTag };
  return workerHandle;
}

async function stopTaskFromFileWorker() {
  if (!workerHandle) return;
  try {
    await workerHandle.ch.cancel(workerHandle.consumerTag);
  } catch (e) {
    /* ignore */
  }
  try {
    await workerHandle.ch.close();
  } catch (e) {
    /* ignore */
  }
  try {
    await workerHandle.conn.close();
  } catch (e) {
    /* ignore */
  }
  workerHandle = null;
}

module.exports = { startTaskFromFileWorker, stopTaskFromFileWorker };
