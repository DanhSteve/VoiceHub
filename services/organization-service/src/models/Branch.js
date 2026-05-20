const { mongoose } = require('/shared/config/mongo');

const branchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, default: '', trim: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

branchSchema.index({ organization: 1, name: 1 });

module.exports = mongoose.model('Branch', branchSchema);
