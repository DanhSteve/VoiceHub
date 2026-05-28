#!/usr/bin/env node
/**
 * Smoke test Task Board API (chạy trong container task-service hoặc host có GATEWAY_INTERNAL_SECRET).
 * Pass khi mọi bước trả HTTP 2xx.
 */
const http = require('http');

const BASE = process.env.TASK_BOARD_SMOKE_BASE || 'http://127.0.0.1:3009';
const USER_ID = process.env.TASK_BOARD_SMOKE_USER_ID || '507f1f77bcf86cd799439011';
const ORG_ID = process.env.TASK_BOARD_SMOKE_ORG_ID || '';
const TEAM_ID = process.env.TASK_BOARD_SMOKE_TEAM_ID || '';
const SCOPE_TYPE = process.env.TASK_BOARD_SMOKE_SCOPE_TYPE || (TEAM_ID ? 'team' : '');
const SCOPE_ID = process.env.TASK_BOARD_SMOKE_SCOPE_ID || TEAM_ID || '';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': USER_ID,
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = { raw };
          }
          resolve({ status: res.statusCode, json });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function assert2xx(label, status) {
  if (status < 200 || status >= 300) {
    throw new Error(`${label}: HTTP ${status}`);
  }
}

async function main() {
  const steps = [];

  const health = await request('GET', '/health');
  assert2xx('GET /health', health.status);
  steps.push('GET /health');

  if (!ORG_ID || !SCOPE_ID) {
    console.log(
      'SKIP board flow: set TASK_BOARD_SMOKE_ORG_ID và TASK_BOARD_SMOKE_SCOPE_ID (hoặc TEAM_ID cũ)'
    );
    console.log('PASS (health only):', steps.join(', '));
    return;
  }

  const createBoard = await request('POST', '/api/tasks/boards', {
    organizationId: ORG_ID,
    ...(SCOPE_TYPE === 'team' ? { teamId: SCOPE_ID } : { scopeType: SCOPE_TYPE, scopeId: SCOPE_ID }),
    title: `smoke-${Date.now()}`,
    visibility: 'private',
  });
  assert2xx('POST /boards', createBoard.status);
  const boardId = createBoard.json?.data?._id;
  if (!boardId) throw new Error('POST /boards: missing board id');
  steps.push('POST /boards');

  const createList = await request('POST', `/api/tasks/boards/${boardId}/lists`, {
    title: 'Smoke list',
  });
  assert2xx('POST /lists', createList.status);
  const listId = createList.json?.data?._id;
  steps.push('POST /lists');

  const createCard = await request('POST', `/api/tasks/boards/${boardId}/cards`, {
    listId,
    title: 'Smoke card',
  });
  assert2xx('POST /cards', createCard.status);
  const cardId = createCard.json?.data?._id;
  steps.push('POST /cards');

  const detail = await request('GET', `/api/tasks/boards/${boardId}`);
  assert2xx('GET /boards/:id', detail.status);
  steps.push('GET /boards/:id');

  const patchCard = await request('PATCH', `/api/tasks/boards/cards/${cardId}`, {
    tags: ['green'],
    dueDate: new Date().toISOString(),
  });
  assert2xx('PATCH /cards/:id', patchCard.status);
  steps.push('PATCH /cards/:id');

  const copyCard = await request('POST', `/api/tasks/boards/cards/${cardId}/copy`, { toListId: listId });
  assert2xx('POST /cards/:id/copy', copyCard.status);
  steps.push('POST /cards/:id/copy');

  const archiveCard = await request('DELETE', `/api/tasks/boards/cards/${cardId}`);
  assert2xx('DELETE /cards/:id', archiveCard.status);
  steps.push('DELETE /cards/:id');

  const archiveList = await request('DELETE', `/api/tasks/boards/${boardId}/lists/${listId}`);
  assert2xx('DELETE /lists/:id', archiveList.status);
  steps.push('DELETE /lists/:id');

  console.log('PASS:', steps.join(' → '));
}

main().catch((err) => {
  console.error('FAIL:', err.message);
  process.exit(1);
});
