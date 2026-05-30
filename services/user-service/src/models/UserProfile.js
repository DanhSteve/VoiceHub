// Sử dụng cùng instance mongoose với connectDB trong thư mục /shared
const { mongo } = require('/shared');
const { mongoose } = mongo;

const userProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      ref: 'UserAuth',
    },
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    emailBlindIndex: {
      type: String,
      default: null,
      sparse: true,
      unique: true,
    },
    displayName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    avatar: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      maxlength: 500,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    /** HMAC blind index cho tra cứu / unique khi phone được mã hóa at-rest */
    phoneBlindIndex: {
      type: String,
      default: null,
      sparse: true,
      unique: true,
    },
    /** Phiên bản mã hóa trường PII (0 = legacy plaintext) */
    encV: {
      type: Number,
      default: 0,
    },
    /** Date (legacy plaintext) hoặc ciphertext string khi bật mã hóa */
    dateOfBirth: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    location: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['online', 'offline', 'away', 'busy'],
      default: 'offline',
    },
    isInvisible: {
      type: Boolean,
      default: false, // Khi true, người khác sẽ không thấy online status
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    preferences: {
      theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'auto',
      },
      language: {
        type: String,
        default: 'vi',
      },
      notifications: {
        type: Boolean,
        default: true,
      },
    },
    /** Biệt danh hiển thị theo tổ chức — key: organizationId */
    orgNicknames: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
  },
  {
    timestamps: true,
  }
);

// Virtual để lấy thông tin cơ bản
userProfileSchema.index({ email: 1 });

userProfileSchema.virtual('publicInfo').get(function () {
  return {
    userId: this.userId,
    username: this.username,
    email: this.email,
    displayName: this.displayName,
    avatar: this.avatar,
    status: this.status,
  };
});

// Method để cập nhật last seen
userProfileSchema.methods.updateLastSeen = function () {
  this.lastSeen = new Date();
  return this.save();
};

// Method để cập nhật status
userProfileSchema.methods.updateStatus = function (status) {
  this.status = status;
  if (status === 'online' || status === 'offline') {
    this.lastSeen = new Date();
  }
  return this.save();
};

const UserProfile = mongoose.model('UserProfile', userProfileSchema);

module.exports = UserProfile;



