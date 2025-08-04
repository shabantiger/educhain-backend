const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  institutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: true
  },
  planId: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'cancelled'],
    default: 'active'
  },
  currentPeriodEnd: {
    type: Date,
    required: true
  },
  cancelledAt: {
    type: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema); 