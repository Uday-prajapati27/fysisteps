const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const userSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => randomUUID()
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true
    },
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      lowercase: true,
      trim: true,
      minlength: 3,
      maxlength: 25
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    phone: {
      type: String,
      default: '',
      trim: true
    },
    phoneVerified: {
      type: Boolean,
      default: false
    },
    password: {
      type: String,
      required: [true, 'Password is required']
    },
    avatar: {
      type: String,
      default: ''
    },
    bio: {
      type: String,
      default: ''
    },
    points: {
      type: Number,
      default: 0
    },
    verifiedActivities: {
      type: Number,
      default: 0
    },
    activities: {
      type: Number,
      default: 0
    },
    bonusPoints: {
      type: Number,
      default: 0
    },
    followers: {
      type: [String],
      default: []
    },
    following: {
      type: [String],
      default: []
    },
    impact: {
      trees: { type: Number, default: 0 },
      cleanups: { type: Number, default: 0 },
      wasteKg: { type: Number, default: 0 },
      waterLitres: { type: Number, default: 0 }
    },
    organizations: {
      type: [String],
      default: []
    },
    ecoCoins: {
      type: Number,
      default: 50
    },
    blockedUsers: {
      type: [String],
      default: []
    },
    consecutiveFakeUploads: {
      type: Number,
      default: 0
    },
    totalFakeUploads: {
      type: Number,
      default: 0
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
        delete ret.password;
        delete ret.__v;
        return ret;
      }
    }
  }
);

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User;
