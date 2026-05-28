const mongoose = require('../db');

const taskBoardMemberSchema = new mongoose.Schema(
  {
    boardId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ['owner', 'editor', 'viewer'],
      default: 'viewer',
    },
    canView: {
      type: Boolean,
      default: true,
    },
    canEdit: {
      type: Boolean,
      default: false,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { timestamps: true }
);

taskBoardMemberSchema.index({ boardId: 1, userId: 1 }, { unique: true });
taskBoardMemberSchema.index({ userId: 1, canView: 1 });

module.exports = mongoose.model('TaskBoardMember', taskBoardMemberSchema);
