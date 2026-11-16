import mongoose from 'mongoose';

// One accepted order submitted through the app. Used for "trades from AI
// signals" on the builder stats page; SoDEX's own builder statistics remain
// the source of truth for fees and volume.
const tradeEventSchema = new mongoose.Schema({
  walletHash: { type: String, required: true, index: true },
  network: { type: String, enum: ['mainnet', 'testnet'], required: true },
  symbol: { type: String, required: true, trim: true },
  side: { type: String, enum: ['buy', 'sell'], required: true },
  notionalUsd: { type: Number, default: 0 },
  reduceOnly: { type: Boolean, default: false },
  source: { type: String, enum: ['chat', 'radar', 'charts', 'positions'], default: 'charts', index: true },
  orderIds: { type: [String], default: [] }
}, { timestamps: { createdAt: true, updatedAt: false } });

// Compiled on first use (only when MongoDB is connected), so importing the
// routes never touches the database layer.
export const getTradeEventModel = () =>
  (mongoose.models.TradeEvent as mongoose.Model<any>) || mongoose.model('TradeEvent', tradeEventSchema);
