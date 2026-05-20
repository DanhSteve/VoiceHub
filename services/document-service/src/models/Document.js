const { mongoose } = require('/shared/config/mongo');

const documentSchema = new mongoose.Schema(
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
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
    },
    serverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Server',
    },
    fileUrl: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    previousVersions: [
      {
        fileUrl: String,
        version: Number,
        uploadedAt: Date,
      },
    ],
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
    isPublic: {
      type: Boolean,
      default: false,
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
documentSchema.index({ uploadedBy: 1 });
documentSchema.index({ organizationId: 1 });
documentSchema.index({ serverId: 1 });
documentSchema.index({ name: 1 });
documentSchema.index({ tags: 1 });

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;



