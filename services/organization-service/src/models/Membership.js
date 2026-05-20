const { mongoose } = require('/shared/config/mongo');

const membershipSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'hr', 'member'],
      default: 'member',
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    division: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null,
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'suspended'],
      default: 'active',
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for unique user-organization pair
membershipSchema.index({ user: 1, organization: 1 }, { unique: true });
membershipSchema.index({ organization: 1, role: 1, status: 1 });

membershipSchema.statics.normalizeRole = (role) => {
  const roleMap = {
    owner: 'owner',
    admin: 'admin',
    hr: 'hr',
    human_resources: 'hr',
    nhan_su: 'hr',
    member: 'member',
    org_admin: 'admin',
    department_head: 'admin',
    team_leader: 'member',
    employee: 'member',
  };

  return roleMap[role] || 'member';
};

module.exports = mongoose.model('Membership', membershipSchema);
