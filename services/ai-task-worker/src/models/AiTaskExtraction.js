const mongoose = require('../db');

// Dùng cùng collection với ai-task-service
const aiTaskExtractionSchema = new mongoose.Schema(
  {
    generatedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: { type: String, default: 'queued' },
    taskId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sourceRef: {
      messageId: { type: String, required: true },
      messageType: { type: String, default: 'chat_message' },
    },
    draft: { type: mongoose.Schema.Types.Mixed, default: {} },
    confidence: { type: Number, default: null },
    rawModelOutput: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AiTaskExtraction', aiTaskExtractionSchema);

