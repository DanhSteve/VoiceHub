const { mongo } = require('/shared');
const { mongoose } = mongo;

const userOrgChannelAccessSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, trim: true },
    organizationId: { type: String, required: true, trim: true },
    channelIds: { type: [String], default: [] },
    permissionsByChannelId: { type: mongoose.Schema.Types.Mixed, default: {} },
    scope: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'user_org_channel_access' }
);

userOrgChannelAccessSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
userOrgChannelAccessSchema.index({ organizationId: 1, updatedAt: -1 });

module.exports = mongoose.model('UserOrgChannelAccess', userOrgChannelAccessSchema);
