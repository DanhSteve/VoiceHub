const mongoose = require('../db');

const CALL_STATUSES = ['ringing', 'accepted', 'rejected', 'cancelled', 'timeout', 'ended'];

const callSessionSchema = new mongoose.Schema(
  {
    callerId: { type: String, required: true, trim: true, index: true },
    calleeId: { type: String, required: true, trim: true, index: true },
    status: {
      type: String,
      enum: CALL_STATUSES,
      default: 'ringing',
      index: true,
    },
    /** Phòng mediasoup — gán sau khi có _id */
    roomId: { type: String, default: null, trim: true, index: true },
    media: { type: String, enum: ['audio', 'video'], default: 'video' },
    startedAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null, index: true },
    endedReason: { type: String, default: null, maxlength: 64 },
  },
  { timestamps: true }
);

callSessionSchema.index({ callerId: 1, calleeId: 1, status: 1 });

const CallSession = mongoose.model('CallSession', callSessionSchema);

module.exports = CallSession;
module.exports.CALL_STATUSES = CALL_STATUSES;
