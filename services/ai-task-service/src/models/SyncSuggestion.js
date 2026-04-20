const mongoose = require('../db');

const syncSuggestionSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, required: true },
    extractionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    messageId: { type: String, required: true },
    changeType: { type: String, enum: ['edited', 'deleted', 'recalled'], required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    proposedPatch: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

syncSuggestionSchema.index({ taskId: 1, status: 1, createdAt: -1 });
syncSuggestionSchema.index({ messageId: 1, status: 1 });

module.exports = mongoose.model('SyncSuggestion', syncSuggestionSchema);

