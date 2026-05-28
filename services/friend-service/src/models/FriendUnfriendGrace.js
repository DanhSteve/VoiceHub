const { mongo } = require('/shared');
const { mongoose } = mongo;

/** Hủy kết bạn — giữ DM đến purgeAt; kết bạn lại trước đó thì hủy lịch xóa. */
const friendUnfriendGraceSchema = new mongoose.Schema(
  {
    userIdA: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userIdB: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    dissolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    dissolvedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    purgeAt: {
      type: Date,
      required: true,
      index: true,
    },
    meta: {
      requestedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
      acceptedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

friendUnfriendGraceSchema.index({ userIdA: 1, userIdB: 1 }, { unique: true });

const FriendUnfriendGrace = mongoose.model('FriendUnfriendGrace', friendUnfriendGraceSchema);

module.exports = FriendUnfriendGrace;
