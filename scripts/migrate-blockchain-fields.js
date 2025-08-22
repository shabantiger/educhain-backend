const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/educhain', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Institution Schema (copy from your models)
const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  walletAddress: { type: String, required: true },
  registrationNumber: { type: String, required: true },
  contactInfo: { type: Object, default: {} },
  verificationDocuments: [{ type: String }],
  isVerified: { type: Boolean, default: false },
  verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  verificationDate: { type: Date },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  // Blockchain fields
  blockchainRegistered: { type: Boolean, default: false },
  blockchainAuthorized: { type: Boolean, default: false },
  blockchainError: { type: String },
  blockchainTxHash: { type: String },
  blockchainRegistrationDate: { type: Date },
  blockchainRevokeTxHash: { type: String },
  blockchainRevokeBlockNumber: { type: Number }
}, { timestamps: true });

const Institution = mongoose.model('Institution', institutionSchema);

async function migrateBlockchainFields() {
  try {
    console.log('Starting blockchain fields migration...');
    
    // Find all institutions that don't have blockchainRegistered field
    const institutions = await Institution.find({
      $or: [
        { blockchainRegistered: { $exists: false } },
        { blockchainAuthorized: { $exists: false } },
        { blockchainError: { $exists: false } },
        { blockchainTxHash: { $exists: false } },
        { blockchainRegistrationDate: { $exists: false } }
      ]
    });
    
    console.log(`Found ${institutions.length} institutions to migrate`);
    
    for (const institution of institutions) {
      console.log(`Migrating institution: ${institution.name} (${institution.email})`);
      
      // Set default values for blockchain fields
      const updateData = {
        blockchainRegistered: institution.blockchainRegistered || false,
        blockchainAuthorized: institution.blockchainAuthorized || false,
        blockchainError: institution.blockchainError || null,
        blockchainTxHash: institution.blockchainTxHash || null,
        blockchainRegistrationDate: institution.blockchainRegistrationDate || null,
        blockchainRevokeTxHash: institution.blockchainRevokeTxHash || null,
        blockchainRevokeBlockNumber: institution.blockchainRevokeBlockNumber || null
      };
      
      await Institution.findByIdAndUpdate(institution._id, updateData);
      console.log(`✅ Migrated: ${institution.name}`);
    }
    
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run migration
migrateBlockchainFields();
