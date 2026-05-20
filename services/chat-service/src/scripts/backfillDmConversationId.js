const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { connectDB, disconnectDB } = require('/shared');
const { mongo } = require('/shared');
const { mongoose } = mongo;
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    dryRun: args.has('--dry-run'),
  };
}

async function ensureConversation(senderId, receiverId, organizationId) {
  const members = [String(senderId), String(receiverId)]
    .sort()
    .map((id) => new mongoose.Types.ObjectId(id));
  const orgFilter = organizationId ? new mongoose.Types.ObjectId(String(organizationId)) : null;

  let conv = await Conversation.findOne({
    type: 'dm',
    members: { $all: members, $size: 2 },
    organizationId: orgFilter,
  }).select('_id');

  if (!conv) {
    conv = await Conversation.create({
      type: 'dm',
      members,
      organizationId: orgFilter,
    });
  }
  return conv._id;
}

async function run() {
  const { dryRun } = parseArgs(process.argv);
  const mongoUri = (process.env.CHAT_MONGODB_URI || '').trim() || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('Missing CHAT_MONGODB_URI/MONGODB_URI');
  }

  await connectDB(mongoUri);

  const baseMatch = {
    roomId: { $in: [null] },
    receiverId: { $exists: true, $ne: null },
    senderId: { $exists: true, $ne: null },
    $or: [{ conversationId: { $exists: false } }, { conversationId: null }],
  };

  const pairs = await Message.aggregate([
    { $match: baseMatch },
    {
      $project: {
        senderId: 1,
        receiverId: 1,
        organizationId: 1,
        minMember: {
          $cond: [{ $lt: ['$senderId', '$receiverId'] }, '$senderId', '$receiverId'],
        },
        maxMember: {
          $cond: [{ $lt: ['$senderId', '$receiverId'] }, '$receiverId', '$senderId'],
        },
      },
    },
    {
      $group: {
        _id: {
          minMember: '$minMember',
          maxMember: '$maxMember',
          organizationId: '$organizationId',
        },
        count: { $sum: 1 },
      },
    },
  ]);

  let updatedMessages = 0;
  let touchedConversations = 0;

  for (const item of pairs) {
    const minMember = item?._id?.minMember;
    const maxMember = item?._id?.maxMember;
    const organizationId = item?._id?.organizationId || null;
    if (!minMember || !maxMember) continue;

    const convId = await ensureConversation(minMember, maxMember, organizationId);
    touchedConversations += 1;

    if (dryRun) continue;

    const res = await Message.updateMany(
      {
        roomId: { $in: [null] },
        $or: [{ conversationId: { $exists: false } }, { conversationId: null }],
        organizationId: organizationId ? new mongoose.Types.ObjectId(String(organizationId)) : null,
        $or: [
          {
            senderId: new mongoose.Types.ObjectId(String(minMember)),
            receiverId: new mongoose.Types.ObjectId(String(maxMember)),
          },
          {
            senderId: new mongoose.Types.ObjectId(String(maxMember)),
            receiverId: new mongoose.Types.ObjectId(String(minMember)),
          },
        ],
      },
      { $set: { conversationId: convId } }
    );
    updatedMessages += Number(res.modifiedCount || 0);
  }

  const mode = dryRun ? 'DRY-RUN' : 'APPLY';
  console.log(
    `[backfillDmConversationId] ${mode} groups=${pairs.length} conversations=${touchedConversations} updatedMessages=${updatedMessages}`
  );
}

run()
  .catch((err) => {
    console.error('[backfillDmConversationId] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await disconnectDB();
    } catch {
      // ignore
    }
    process.exit(process.exitCode || 0);
  });
