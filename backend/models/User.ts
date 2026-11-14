import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  publicWalletAddress: {
    type: String,
    required: true,
  },
  loginNonce: {
    type: String,
    default: null,
  },
  loginMessage: {
    type: String,
    default: null,
  },
  loginNonceExpiresAt: {
    type: Date,
    default: null,
  },
  sessionTokenHash: {
    type: String,
    default: null,
    index: true,
  },
  sessionExpiresAt: {
    type: Date,
    default: null,
  },
  lastLogin: {
    type: Date,
    default: Date.now,
  }
}, {
  timestamps: true
});

const createUserModel = () => mongoose.model('User', userSchema);

// Reuse the registered model when this module is evaluated again (tests reset modules).
export default (mongoose.models.User as ReturnType<typeof createUserModel> | undefined) ?? createUserModel();
