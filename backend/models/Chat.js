const mongoose = require('mongoose');

const toolCallSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  input: {
    type: Object,
    default: {},
  },
  result: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['success', 'error'],
    required: true,
  },
}, { _id: false });

const messageFeedbackSchema = new mongoose.Schema({
  rating: {
    type: String,
    enum: ['up', 'down'],
    required: true,
  },
  at: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  toolCalls: {
    type: [toolCallSchema],
    default: [],
  },
  feedback: {
    type: messageFeedbackSchema,
    default: null,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, { _id: false });

const chatSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    index: true,
  },
  title: {
    type: String,
    default: 'New Research Terminal',
    trim: true,
    maxlength: 120,
  },
  messages: {
    type: [messageSchema],
    default: [],
  },
}, {
  timestamps: true
});

chatSchema.index({ walletAddress: 1, updatedAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);
