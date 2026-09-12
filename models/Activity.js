const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const commentSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: () => randomUUID()
    },
    userId: {
      type: String,
      default: ''
    },
    user: {
      type: String,
      default: ''
    },
    username: {
      type: String,
      default: ''
    },
    avatar: {
      type: String,
      default: ''
    },
    text: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const activitySchema = new mongoose.Schema(
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
    userName: {
      type: String,
      default: ''
    },
    username: {
      type: String,
      default: ''
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      trim: true
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
    beforeImage: {
      type: String,
      default: ''
    },
    afterImage: {
      type: String,
      default: ''
    },
    video: {
      type: String,
      default: ''
    },
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    locationName: {
      type: String,
      default: ''
    },
    locationAccuracy: {
      type: Number,
      default: null
    },
    submittedAt: {
      type: Date,
      default: Date.now
    },
    verificationStatus: {
      type: String,
      enum: ['verified', 'pending', 'rejected'],
      default: 'pending'
    },
    verificationScore: {
      type: Number,
      default: 0
    },
    verificationSignals: {
      type: [String],
      default: []
    },
    aiVerification: {
      score: { type: Number, default: 0 },
      detectedObjects: { type: [String], default: [] },
      authenticity: { type: String, default: 'unverified' },
      aiSummary: { type: String, default: '' },
      aiGeneratedProbability: { type: String, default: 'low' }
    },
    pointsAwarded: {
      type: Number,
      default: 50
    },
    impactMetrics: {
      trees: { type: Number, default: 0 },
      cleanups: { type: Number, default: 0 },
      wasteKg: { type: Number, default: 0 },
      waterLitres: { type: Number, default: 0 }
    },
    likes: {
      type: Number,
      default: 0
    },
    likedBy: {
      type: [String],
      default: []
    },
    comments: {
      type: [commentSchema],
      default: []
    },
    fakeReports: {
      type: Number,
      default: 0
    },
    isFake: {
      type: Boolean,
      default: false
    },
    flaggedReason: {
      type: String,
      default: ''
    },
    hidden: {
      type: Boolean,
      default: false
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

activitySchema.index({ createdAt: -1 });
activitySchema.index({ user: 1 });
activitySchema.index({ verificationStatus: 1 });

const Activity = mongoose.models.Activity || mongoose.model('Activity', activitySchema);

module.exports = Activity;
