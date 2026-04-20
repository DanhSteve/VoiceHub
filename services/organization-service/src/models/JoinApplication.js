const { mongoose } = require('/shared/config/mongo');

const joinApplicationSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    applicantUser: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    formVersion: { type: Number, required: true, min: 1 },
    formSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    answers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    rejectionReason: {
      type: String,
      maxlength: 2000,
      default: '',
    },
  },
  { timestamps: true }
);

joinApplicationSchema.index({ organization: 1, status: 1, submittedAt: -1 });
joinApplicationSchema.index(
  { organization: 1, applicantUser: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'pending' },
  }
);

module.exports = mongoose.model('JoinApplication', joinApplicationSchema);
