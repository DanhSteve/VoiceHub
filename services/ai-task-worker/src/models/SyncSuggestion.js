const mongoose = require('../db');

const syncSuggestionSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, required: true },
    extractionId: { type: mongoose.Schema.Types.ObjectId, required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    messageId: { type: String, required: true },
    changeType: { type: String, required: true },
    status: { type: String, default: 'pending' },
    proposedPatch: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SyncSuggestion', syncSuggestionSchema);

