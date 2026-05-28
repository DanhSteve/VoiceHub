const mongoose = require('../db');

const taskBoardSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null,
      index: true,
    },
    scopeType: {
      type: String,
      enum: ['team', 'department', 'division'],
      default: 'team',
      index: true,
    },
    scopeId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
      default: null,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    background: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    visibility: {
      type: String,
      enum: ['private', 'workspace'],
      default: 'private',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  { timestamps: true }
);

taskBoardSchema.index({ organizationId: 1, teamId: 1, isActive: 1, createdAt: -1 });
taskBoardSchema.index({ organizationId: 1, scopeType: 1, scopeId: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model('TaskBoard', taskBoardSchema);
