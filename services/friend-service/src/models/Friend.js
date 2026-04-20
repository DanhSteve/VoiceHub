// Dùng singleton mongoose từ /shared để đảm bảo connectDB() áp dụng cho model
const { mongo } = require('/shared');
const { mongoose } = mongo;

const friendSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    friendId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'blocked'],
      default: 'pending',
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
friendSchema.index({ userId: 1, friendId: 1 }, { unique: true });
friendSchema.index({ userId: 1, status: 1 });
friendSchema.index({ friendId: 1, status: 1 });

// Prevent self-friending (async style tương thích Mongoose 7+)
friendSchema.pre('save', function () {
  if (this.userId && this.friendId && this.userId.toString() === this.friendId.toString()) {
    throw new Error('Cannot add yourself as a friend');
  }
});

const Friend = mongoose.model('Friend', friendSchema);

module.exports = Friend;



