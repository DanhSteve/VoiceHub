const { mongo } = require('/shared');
const { mongoose } = mongo;

const voiceRoomLobbySchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    hostUserId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    joinPolicy: {
      type: String,
      enum: ['approval', 'open'],
      default: 'approval',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VoiceRoomLobby', voiceRoomLobbySchema);
