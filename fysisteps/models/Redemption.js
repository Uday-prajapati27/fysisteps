const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const redemptionSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => randomUUID()
    },
    user: {
      type: String,
      ref: 'User',
      required: true
    },
    reward: {
      type: String,
      ref: 'Reward',
      required: true
    },
    title: {
      type: String,
      required: true
    },
    cost: {
      type: Number,
      required: true
    },
    code: {
      type: String,
      required: true
    },
    redeemedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      }
    }
  }
);

redemptionSchema.index({ user: 1, redeemedAt: -1 });

const Redemption = mongoose.models.Redemption || mongoose.model('Redemption', redemptionSchema);

module.exports = Redemption;
