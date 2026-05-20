#!/usr/bin/env node
/**
 * Quét các thư mục có package.json (bỏ qua node_modules) và chạy npm ci, fallback npm install.
 * Dùng sau khi pull: `node scripts/sync-node-deps.mjs`
 */
import { readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite', 'coverage']);

/** Mọi thư mục có package.json (duyệt đệ quy, bỏ node_modules). */
function findPackageRoots(startDir) {
  /** @type {string[]} */
  const out = [];
  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (SKIP_DIRS.has(e.name)) continue;
      walk(join(current, e.name));
    }
    if (entries.some((e) => e.isFile() && e.name === 'package.json')) {
      out.push(current);
    }
  }
  walk(startDir);
  return out;
}

function npm(dir, args) {
  const r = spawnSync('npm', args, {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  return r.status ?? 1;
}

const roots = findPackageRoots(root).sort((a, b) => relative(root, a).localeCompare(relative(root, b)));

console.log(`[sync-node-deps] Tìm thấy ${roots.length} package(s).\n`);

let failed = 0;
for (const dir of roots) {
  const label = relative(root, dir) || '.';
  console.log(`\n--- ${label} ---`);
  const hasLock = existsSync(join(dir, 'package-lock.json'));
  const primary = hasLock ? ['ci'] : ['install'];
  let code = npm(dir, [...primary, '--no-audit', '--no-fund']);
  if (code !== 0 && hasLock) {
    console.warn(`[sync-node-deps] npm ci thất bại, thử npm install tại ${label}`);
    code = npm(dir, ['install', '--no-audit', '--no-fund']);
  }
  if (code !== 0) {
    console.error(`[sync-node-deps] Lỗi tại ${label} (exit ${code})`);
    failed += 1;
  }
}

if (failed) {
  console.error(`\n[sync-node-deps] Hoàn tất với ${failed} lỗi.`);
  process.exit(1);
}
console.log('\n[sync-node-deps] Xong.');
process.exit(0);
