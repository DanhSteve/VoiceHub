/**
 * Smoke: gateway nhận diện path workspace task-boards.
 * Chạy: node tests/task-workspace-board-routes.smoke.js
 */
const assert = require('assert');
const { isWorkspaceTaskBoardPath, getServiceByPath } = require('../api-gateway/src/config/services');

const samples = [
  ['/api/workspaces/aba/task-boards', true],
  ['/api/workspaces/aba/task-boards/b1', true],
  ['/api/workspaces/aba/task-boards/cards/c1/move', true],
  ['/api/organizations/xyz', false],
  ['/api/tasks/boards', false],
];

for (const [path, expected] of samples) {
  assert.strictEqual(isWorkspaceTaskBoardPath(path), expected, path);
}

const taskSvc = getServiceByPath('/api/workspaces/demo/task-boards');
assert.strictEqual(taskSvc?.name, 'task', 'workspace task-boards → task-service');

const orgSvc = getServiceByPath('/api/organizations/demo');
assert.strictEqual(orgSvc?.name, 'organization', 'organizations → organization-service');

console.log('[ok] task-workspace-board-routes.smoke');
