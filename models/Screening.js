import mongoose from 'mongoose';

const screeningSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
  },
  score: {
    type: Number,
    required: true,
  },
  level: {
    type: String,
    required: true,
    enum: ['Minimal', 'Mild', 'Moderate', 'Moderately Severe', 'Severe']
  },
  answers: [{
    question: String,
    answer: Number
  }],
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { versionKey: false });

const Screening = mongoose.model('Screening', screeningSchema);

export default Screening; 