const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const rewardSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => randomUUID()
    },
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    cost: {
      type: Number,
      required: [true, 'Cost in GreenPoints is required'],
      min: 1
    },
    icon: {
      type: String,
      default: '🎁'
    },
    partnerName: {
      type: String,
      required: [true, 'Partner name is required']
    },
    partnerWebsite: {
      type: String,
      default: ''
    },
    terms: {
      type: String,
      default: ''
    },
    codePrefix: {
      type: String,
      default: 'GREEN'
    },
    expiresAt: {
      type: Date,
      default: null
    },
    verified: {
      type: Boolean,
      default: true
    },
    isDemo: {
      type: Boolean,
      default: false
    },
    createdAt: {
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

const Reward = mongoose.models.Reward || mongoose.model('Reward', rewardSchema);

module.exports = Reward;
