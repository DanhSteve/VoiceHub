const { mongo } = require('/shared');
const { mongoose } = mongo;

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['dm', 'group'],
      default: 'dm',
      required: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
    ],
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

conversationSchema.index({ type: 1, members: 1, organizationId: 1 });
conversationSchema.index({ organizationId: 1, createdAt: -1 });
conversationSchema.index({ members: 1, createdAt: -1 });

const Conversation = mongoose.model('Conversation', conversationSchema);

module.exports = Conversation;
