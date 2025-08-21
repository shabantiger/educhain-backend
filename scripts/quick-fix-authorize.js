// quick-fix-authorize.js
// Run this script to authorize existing verified institutions

import mongoose from 'mongoose';
import Institution from '../models/Institution.js';

async function authorizeExistingInstitutions() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI_LOCAL || process.env.MONGODB_URI;
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find all verified institutions that aren't blockchain registered
    const institutions = await Institution.find({ 
      isVerified: true,
      $or: [
        { blockchainRegistered: { $ne: true } },
        { blockchainRegistered: { $exists: false } }
      ]
    });

    console.log(`Found ${institutions.length} institutions to register/authorize`);

         // Connect admin wallet
     const { blockchainService } = await import('../lib/blockchain.js');
     await blockchainService.connectWallet();
     console.log('Admin wallet connected');

    for (const institution of institutions) {
      try {
        console.log(`Processing institution: ${institution.name}`);
        
        // Check if already registered on blockchain
        try {
          const stats = await blockchainService.getInstitutionStats(institution.walletAddress);
          
          if (stats.isAuthorized) {
            console.log(`${institution.name} is already authorized on blockchain`);
            institution.blockchainRegistered = true;
            institution.blockchainAuthorized = true;
            await institution.save();
            continue;
          }
          
          if (stats.registrationDate > 0) {
            console.log(`${institution.name} is registered but not authorized`);
            institution.blockchainRegistered = true;
            // You'll need to call authorize function here if your contract has one
            await institution.save();
            continue;
          }
        } catch (statsError) {
          console.log(`${institution.name} not found on blockchain, registering...`);
        }
        
        // Register institution on blockchain
        const txHash = await blockchainService.registerInstitution(
          institution.name,
          institution.email
        );
        
        console.log(`✅ ${institution.name} registered on blockchain. TX: ${txHash}`);
        
                 // Update database
         institution.blockchainRegistered = true;
         institution.blockchainTxHash = txHash;
         institution.blockchainRegistrationDate = new Date();
         institution.blockchainError = null;
         await institution.save();
        
        // Wait a bit between transactions to avoid nonce issues
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Failed to register ${institution.name}:`, error.message);
        institution.blockchainError = error.message;
        await institution.save();
      }
    }
    
    console.log('Authorization process complete');
    
  } catch (error) {
    console.error('Script error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

// Run the script
authorizeExistingInstitutions();
