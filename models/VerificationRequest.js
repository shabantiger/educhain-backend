require('dotenv').config();
const mongoose = require('mongoose');

const verificationRequestSchema = new mongoose.Schema({
  institutionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Institution',
    required: true
  },
  institutionName: {
    type: String,
    required: true
  },
  institutionEmail: {
    type: String,
    required: true
  },
  registrationNumber: {
    type: String,
    required: true
  },
  documents: {
    type: Array,
    default: []
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: {
    type: Date,
    default: null
  },
  reviewedBy: {
    type: String,
    default: null
  },
  comments: {
    type: String,
    default: null
  }
});

module.exports = mongoose.model('VerificationRequest', verificationRequestSchema); 