const mongoose = require('mongoose');

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

module.exports = mongoose.model('User', userSchema);
