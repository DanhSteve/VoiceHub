const mongoose = require('../db');

const aiTaskExtractionSchema = new mongoose.Schema(
  {
    generatedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, required: true },
    status: {
      type: String,
      enum: ['queued', 'processing', 'ready', 'failed', 'confirmed'],
      default: 'queued',
    },
    taskId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sourceRef: {
      messageId: { type: String, required: true },
      messageType: { type: String, default: 'chat_message' },
    },
    sync: {
      isDetached: { type: Boolean, default: false },
      isLocked: { type: Boolean, default: false },
      lastSyncedAt: { type: Date, default: null },
    },
    draft: {
      title: { type: String, default: '' },
      description: { type: String, default: '' },
      assigneeId: { type: mongoose.Schema.Types.ObjectId, default: null },
      assigneeName: { type: String, default: '' },
      dueDate: { type: Date, default: null },
      priority: { type: String, default: 'medium' },
      tags: { type: [String], default: [] },
    },
    confidence: { type: Number, default: null },
    rawModelOutput: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

aiTaskExtractionSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
aiTaskExtractionSchema.index({ 'sourceRef.messageId': 1 });

module.exports = mongoose.model('AiTaskExtraction', aiTaskExtractionSchema);

