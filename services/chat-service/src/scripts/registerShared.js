/**
 * Map require('/shared/...') khi chạy script trên host (Windows/macOS).
 * Trong Docker, volume mount ./shared → /shared nên không cần file này.
 */
const path = require('path');
const fs = require('fs');
const Module = require('module');

function findRepoRoot(fromDir) {
  let dir = fromDir;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'shared', 'index.js'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function registerShared() {
  if (global.__VOICEHUB_SHARED_REGISTERED) return;

  const repoRoot = findRepoRoot(__dirname);
  if (!repoRoot) {
    throw new Error(
      '[registerShared] Không tìm thấy thư mục shared/ — chạy từ repo VoiceHub hoặc dùng Docker: docker compose exec chat-service npm run backfill:message-search'
    );
  }

  const sharedRoot = path.join(repoRoot, 'shared');
  const sharedNodeModules = path.join(sharedRoot, 'node_modules');
  if (fs.existsSync(sharedNodeModules) && !module.paths.includes(sharedNodeModules)) {
    module.paths.unshift(sharedNodeModules);
  }

  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function resolveShared(request, parent, isMain, options) {
    if (request === '/shared') {
      return origResolve.call(
        this,
        path.join(sharedRoot, 'index.js'),
        parent,
        isMain,
        options
      );
    }
    if (request.startsWith('/shared/')) {
      return origResolve.call(
        this,
        path.join(sharedRoot, request.slice('/shared/'.length)),
        parent,
        isMain,
        options
      );
    }
    return origResolve.call(this, request, parent, isMain, options);
  };

  global.__VOICEHUB_SHARED_REGISTERED = true;
}

module.exports = { registerShared };
