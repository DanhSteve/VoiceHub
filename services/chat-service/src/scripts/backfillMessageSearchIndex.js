/**
 * Backfill org channel messages vào Meilisearch (wave-3b).
 *
 * Usage:
 *   node src/scripts/backfillMessageSearchIndex.js
 *   node src/scripts/backfillMessageSearchIndex.js --orgId=<mongoId>
 *   node src/scripts/backfillMessageSearchIndex.js --hasAttachment
 */
const path = require('path');
require('./registerShared').registerShared();
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

/** Trên host: MEILI_HOST=http://127.0.0.1:7700 nếu .env trỏ meilisearch (tên Docker). */
if (
  String(process.env.MEILI_HOST || '').includes('meilisearch') &&
  !process.env.DOCKER_CONTAINER
) {
  process.env.MEILI_HOST = 'http://127.0.0.1:7700';
}

const { mongo } = require('/shared');
const { mongoose } = mongo;
const Message = require('../models/Message');
const { isOrgIndexableMessage } = require('../search/messageSearchDocument');
const { upsertOrgMessageDocument } = require('../services/messageSearchIndex.service');
const { ensureOrgMessagesIndex, pingMeilisearch } = require('../services/meilisearchClient');

const BATCH = Math.min(500, Math.max(50, Number(process.env.MESSAGE_SEARCH_BACKFILL_BATCH || 200)));

function parseArgs(argv) {
  const out = { orgId: null, hasAttachment: false };
  for (const a of argv) {
    if (a === '--hasAttachment') out.hasAttachment = true;
    if (a.startsWith('--orgId=')) out.orgId = a.slice('--orgId='.length).trim();
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mongoUri = (process.env.CHAT_MONGODB_URI || '').trim() || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI / CHAT_MONGODB_URI required');
    process.exit(1);
  }
  const ping = await pingMeilisearch();
  if (!ping.ok) {
    console.error(`Meilisearch không kết nối được (${ping.host || process.env.MEILI_HOST})`);
    if (ping.error) console.error(`  Chi tiết: ${ping.error}`);
    console.error('  • Bật container: docker compose up -d meilisearch');
    console.error('  • Chạy trên host: MEILI_HOST=http://127.0.0.1:7700 (cổng 7700 đã publish)');
    console.error('  • Hoặc trong Docker: docker compose exec chat-service npm run backfill:message-search');
    process.exit(1);
  }
  console.log(`[backfill] Meilisearch OK — ${ping.host}`);

  await mongoose.connect(mongoUri);
  await ensureOrgMessagesIndex();

  const filter = {
    organizationId: { $exists: true, $ne: null },
    roomId: { $exists: true, $ne: null },
    isDeleted: { $ne: true },
    isRecalled: { $ne: true },
  };
  if (args.orgId) {
    filter.organizationId = args.orgId;
  }
  if (args.hasAttachment) {
    filter.$or = [
      { messageType: 'file' },
      { messageType: 'image' },
      { 'fileMeta.storagePath': { $exists: true, $nin: [null, ''] } },
    ];
  }

  let processed = 0;
  let indexed = 0;
  let lastId = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const q = { ...filter };
    if (lastId) q._id = { $gt: lastId };
    const batch = await Message.find(q).sort({ _id: 1 }).limit(BATCH).exec();
    if (!batch.length) break;

    for (const doc of batch) {
      processed += 1;
      lastId = doc._id;
      if (!isOrgIndexableMessage(doc)) continue;
      try {
        await upsertOrgMessageDocument(doc);
        indexed += 1;
      } catch (err) {
        console.error('[backfill] upsert failed', String(doc._id), err.message);
      }
    }
    console.log(`[backfill] processed=${processed} indexed=${indexed}`);
  }

  console.log(`[backfill] done processed=${processed} indexed=${indexed}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
