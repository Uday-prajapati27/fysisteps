const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const orderSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      default: () => randomUUID()
    },
    orderId: {
      type: String,
      required: true,
      unique: true
    },
    transactionId: {
      type: String,
      required: true
    },
    userId: {
      type: String,
      default: 'guest'
    },
    userName: {
      type: String,
      required: true
    },
    userPhone: {
      type: String,
      default: ''
    },
    productId: {
      type: String,
      default: ''
    },
    productTitle: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      default: 1
    },
    unitPrice: {
      type: Number,
      required: true
    },
    totalAmount: {
      type: Number,
      required: true
    },
    shippingAddress: {
      type: String,
      required: true
    },
    paymentMethod: {
      type: String,
      default: 'upi'
    },
    paymentDetails: {
      method: { type: String, default: 'upi' },
      upiId: { type: String, default: null },
      cardLast4: { type: String, default: null },
      status: { type: String, default: 'PAID' },
      paidAt: { type: Date, default: Date.now }
    },
    ecoCoinsUsed: {
      type: Number,
      default: 0
    },
    ecoCoinsEarned: {
      type: Number,
      default: 25
    },
    status: {
      type: String,
      default: 'CONFIRMED'
    },
    estimatedDelivery: {
      type: String,
      default: ''
    },
    orderedAt: {
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

orderSchema.index({ userId: 1, orderedAt: -1 });

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

module.exports = Order;
