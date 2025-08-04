require('dotenv').config();
const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  studentAddress: { type: String, required: true },
  studentName: { type: String, required: true },
  courseName: { type: String, required: true },
  grade: { type: String },
  completionDate: { type: Date },
  certificateType: { type: String },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution' },
  institutionName: { type: String },
  issuedAt: { type: Date },
  tokenId: { type: Number },
  isValid: { type: Boolean, default: true },
  studentId: { type: String },
  studentEmail: { type: String },
  ipfsHash: { type: String },
  isMinted: { type: Boolean, default: false },
  mintedTo: { type: String, default: '' },
  mintedAt: { type: Date }
});

module.exports = mongoose.model('Certificate', certificateSchema);
