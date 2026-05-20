const { mongoose } = require('/shared/config/mongo');

const joinFormFieldSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, trim: true },
    label: { type: String, required: true, maxlength: 300 },
    type: {
      type: String,
      enum: ['short_text', 'long_text', 'single_choice', 'radio', 'checkbox'],
      required: true,
    },
    required: { type: Boolean, default: false },
    options: [{ type: String, maxlength: 200 }],
  },
  { _id: false }
);

const joinApplicationFormSettingsSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    formVersion: { type: Number, default: 1, min: 1 },
    defaultRoleOnApprove: {
      type: String,
      enum: ['member', 'admin'],
      default: 'member',
    },
    fields: { type: [joinFormFieldSchema], default: [] },
  },
  { _id: false }
);

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      maxlength: 1000,
      default: '',
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    logo: {
      type: String,
      default: null,
    },
    slug: {
      type: String,
      trim: true,
      lowercase: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'],
      default: 'ACTIVE',
    },
    type: {
      type: String,
      trim: true,
      default: '',
    },
    teamSize: {
      type: String,
      trim: true,
      default: '',
    },
    industry: {
      type: String,
      trim: true,
      default: '',
    },
    settings: {
      allowPublicJoin: {
        type: Boolean,
        default: false,
      },
      requireApproval: {
        type: Boolean,
        default: true,
      },
      joinApplicationForm: {
        type: joinApplicationFormSettingsSchema,
        default: () => ({}),
      },
    },
    provisioning: {
      structure: {
        status: {
          type: String,
          enum: ['pending', 'running', 'ready', 'failed'],
          default: 'ready',
        },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null },
        error: { type: String, default: '' },
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
organizationSchema.index({ ownerId: 1 });
organizationSchema.index({ name: 1 });
organizationSchema.index({ isActive: 1 });
organizationSchema.index({ slug: 1 }, { unique: true, sparse: true });
organizationSchema.index({ status: 1 });

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;



