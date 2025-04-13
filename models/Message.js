import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true
  },
  facultyId: {
    type: String,
    required: true
  },
  conversation: [{
    text: {
      type: String,
      required: true
    },
    senderId: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    read: {
      type: Boolean,
      default: false
    }
  }],
  lastMessage: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create a compound index for efficient querying
messageSchema.index({ studentId: 1, facultyId: 1 }, { unique: true });

export default mongoose.models.Message || mongoose.model('Message', messageSchema); 