const mongoose = require('../db');

const taskBoardListWatcherSchema = new mongoose.Schema(
  {
    listId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
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
  },
  { timestamps: true }
);

taskBoardListWatcherSchema.index({ listId: 1, userId: 1 }, { unique: true });
taskBoardListWatcherSchema.index({ boardId: 1, userId: 1 });

module.exports = mongoose.model('TaskBoardListWatcher', taskBoardListWatcherSchema);
