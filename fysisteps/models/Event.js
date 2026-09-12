const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const eventSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => randomUUID()
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    date: {
      type: Date,
      default: Date.now
    },
    location: {
      type: String,
      default: ''
    },
    organizer: {
      type: String,
      default: ''
    },
    category: {
      type: String,
      default: 'Community'
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

const Event = mongoose.models.Event || mongoose.model('Event', eventSchema);

module.exports = Event;
