import mongoose from 'mongoose';

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

const analysisSynthesisSchema = new mongoose.Schema({
  overallLabel: { type: String, default: 'Neutral' },
  directionalScore: { type: Number, default: null },
  riskScore: { type: Number, default: null },
  confidence: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  analyzedTools: { type: Number, default: 0 },
  thesis: { type: [String], default: [] },
  conflicts: { type: [String], default: [] },
  riskFlags: { type: [String], default: [] }
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
  analysisSynthesis: {
    type: analysisSynthesisSchema,
    default: null,
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

const createChatModel = () => mongoose.model('Chat', chatSchema);

// Reuse the registered model when this module is evaluated again (tests reset modules).
export default (mongoose.models.Chat as ReturnType<typeof createChatModel> | undefined) ?? createChatModel();
