const { mongoose } = require('/shared/config/mongo');

const channelRoleAccessSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
      index: true,
    },
    roleId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    permissions: {
      canSee: { type: Boolean, default: false },
      canRead: { type: Boolean, default: false },
      canWrite: { type: Boolean, default: false },
      canDelete: { type: Boolean, default: false },
      canVoice: { type: Boolean, default: false },
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

channelRoleAccessSchema.index({ organization: 1, channel: 1, roleId: 1 }, { unique: true });

module.exports = mongoose.model('ChannelRoleAccess', channelRoleAccessSchema);
