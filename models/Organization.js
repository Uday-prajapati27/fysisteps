const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const organizationSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => randomUUID()
    },
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    location: {
      type: String,
      default: ''
    },
    icon: {
      type: String,
      default: '🌿'
    },
    type: {
      type: String,
      default: 'Organization'
    },
    members: {
      type: Number,
      default: 0
    },
    website: {
      type: String,
      default: ''
    },
    impact: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({})
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

const Organization = mongoose.models.Organization || mongoose.model('Organization', organizationSchema);

module.exports = Organization;
