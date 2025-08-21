import mongoose from 'mongoose';

const institutionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  walletAddress: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  registrationNumber: {
    type: String,
    required: true,
    unique: true
  },
  contactInfo: {
    phone: String,
    address: String,
    website: String
  },
  verificationDocuments: [{
    type: String,
    description: String,
    url: String,
    originalName: String
  }],
  verificationStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'not_submitted'],
    default: 'not_submitted'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  // Blockchain integration fields
  blockchainRegistered: {
    type: Boolean,
    default: false
  },
  blockchainAuthorized: {
    type: Boolean,
    default: false
  },
  blockchainTxHash: {
    type: String,
    default: null
  },
  blockchainAuthTxHash: {
    type: String,
    default: null
  },
  blockchainError: {
    type: String,
    default: null
  },
  blockchainRegistrationDate: {
    type: Date,
    default: null
  },
  blockchainAuthorizationDate: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Index for efficient queries
institutionSchema.index({ email: 1 });
institutionSchema.index({ walletAddress: 1 });
institutionSchema.index({ isVerified: 1 });
institutionSchema.index({ blockchainRegistered: 1 });
institutionSchema.index({ blockchainAuthorized: 1 });

const Institution = mongoose.model('Institution', institutionSchema);

export default Institution; 
