#!/usr/bin/env node
/**
 * Xóa placement legacy khỏi membership docs.
 * Chạy sau khi backfill assignment hoàn tất.
 */
const { connectDB, disconnectDB, mongoose } = require('/shared/config/mongo');

async function main() {
  await connectDB(process.env.MONGODB_URI, { exitOnFailure: false });
  const db = mongoose.connection.db;
  const orgId = process.env.MIGRATE_ORG_ID || '';
  const filter = orgId ? { organization: new mongoose.Types.ObjectId(String(orgId)) } : {};
  const result = await db.collection('memberships').updateMany(filter, {
    $unset: {
      branch: '',
      division: '',
      department: '',
      team: '',
    },
  });
  console.log(
    JSON.stringify(
      {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        scopedOrganizationId: orgId || null,
      },
      null,
      2
    )
  );
  await disconnectDB();
}

main().catch(async (err) => {
  console.error('[migrate-membership-drop-placement] FAIL:', err?.message || err);
  try {
    await disconnectDB();
  } catch {
    // ignore
  }
  process.exit(1);
});
