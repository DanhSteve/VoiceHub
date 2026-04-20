const { mongo } = require('/shared');
const { mongoose } = mongo;

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    type: {
      type: String,
      enum: [
        'friend_request',
        'friend_accepted',
        'task_assigned',
        'task_completed',
        'message',
        'meeting',
        'document',
        'system',
        'org_join_application',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    actionUrl: {
      type: String,
      default: null,
    },
    encV: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
