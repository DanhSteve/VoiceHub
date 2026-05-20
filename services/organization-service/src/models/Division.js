const { mongoose } = require('/shared/config/mongo');

const divisionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

divisionSchema.index({ organization: 1, branch: 1, name: 1 });

module.exports = mongoose.model('Division', divisionSchema);
