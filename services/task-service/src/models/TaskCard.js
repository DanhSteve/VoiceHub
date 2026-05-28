const mongoose = require('../db');

const taskCardSchema = new mongoose.Schema(
  {
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    listId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    summary: {
      type: String,
      default: '',
      maxlength: 500,
    },
    description: {
      type: String,
      default: '',
      maxlength: 12000,
    },
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    departmentName: {
      type: String,
      trim: true,
      default: '',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    dueDate: {
      type: Date,
      default: null,
    },
    position: {
      type: Number,
      default: 1000,
      index: true,
    },
    tags: [{ type: String, trim: true }],
    sourceMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    aiGenerated: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

taskCardSchema.index({ boardId: 1, listId: 1, isArchived: 1, position: 1, createdAt: 1 });

module.exports = mongoose.model('TaskCard', taskCardSchema);
