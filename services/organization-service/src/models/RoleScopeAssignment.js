const { mongoose } = require('/shared/config/mongo');

const roleScopeAssignmentSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    roleId: {
      type: String,
      required: true,
      trim: true,
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
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    source: {
      type: String,
      enum: ['role_sync', 'migration', 'manual'],
      default: 'role_sync',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  { timestamps: true }
);

roleScopeAssignmentSchema.index(
  { organization: 1, user: 1, roleId: 1, scopeType: 1, scopeId: 1 },
  { unique: true, name: 'uniq_org_user_role_scope' }
);
roleScopeAssignmentSchema.index(
  { organization: 1, user: 1, active: 1, scopeType: 1 },
  { name: 'idx_org_user_active_scope' }
);
roleScopeAssignmentSchema.index(
  { organization: 1, scopeType: 1, scopeId: 1, active: 1 },
  { name: 'idx_org_scope_active' }
);

module.exports = mongoose.model('RoleScopeAssignment', roleScopeAssignmentSchema);
