const { mongoose } = require('/shared/config/mongo');

const scopeRoleAccessSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    scopeType: {
      type: String,
      enum: ['division', 'department', 'team'],
      required: true,
      index: true,
    },
    scopeId: {
      type: mongoose.Schema.Types.ObjectId,
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

scopeRoleAccessSchema.index(
  { organization: 1, scopeType: 1, scopeId: 1, roleId: 1 },
  { unique: true }
);

module.exports = mongoose.model('ScopeRoleAccess', scopeRoleAccessSchema);
