/**
 * Smoke: workspace path-based tab URLs.
 * Chạy: node tests/workspace-tab-url.smoke.js
 */
import assert from 'node:assert/strict';
import {
  parseWorkspaceTabFromLocation,
  buildWorkspacePath,
  resolveLegacyWorkspaceRedirect,
} from '../client/src/utils/workspaceTabUtils.js';

assert.strictEqual(parseWorkspaceTabFromLocation('/w/aba/tasks', ''), 'tasks');
assert.strictEqual(parseWorkspaceTabFromLocation('/w/aba/chat', ''), 'chat');
assert.strictEqual(parseWorkspaceTabFromLocation('/w/aba', ''), 'chat');
assert.strictEqual(parseWorkspaceTabFromLocation('/w/aba', '?tab=documents'), 'documents');

assert.strictEqual(buildWorkspacePath('aba', 'tasks'), '/w/aba/tasks');
assert.strictEqual(buildWorkspacePath('aba', 'chat', { channelId: 'x' }), '/w/aba/chat?channelId=x');

assert.strictEqual(resolveLegacyWorkspaceRedirect('/w/aba', ''), '/w/aba/chat');
assert.strictEqual(resolveLegacyWorkspaceRedirect('/w/aba', '?tab=tasks'), '/w/aba/tasks');
assert.strictEqual(
  resolveLegacyWorkspaceRedirect('/w/aba', '?tab=tasks&channelId=c1'),
  '/w/aba/tasks?channelId=c1'
);
assert.strictEqual(resolveLegacyWorkspaceRedirect('/w/aba/tasks', ''), null);
assert.strictEqual(resolveLegacyWorkspaceRedirect('/w/aba/chat', ''), null);

console.log('[ok] workspace-tab-url.smoke');
