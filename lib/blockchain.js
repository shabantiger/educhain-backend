// Mock blockchain service for testing
// In production, replace this with actual blockchain integration

class MockBlockchainService {
  constructor() {
    this.isConnected = false;
    this.transactionCounter = 0;
  }

  async connectWallet() {
    console.log('Mock: Connecting to blockchain wallet...');
    this.isConnected = true;
    return true;
  }

  async registerInstitution(name, email) {
    if (!this.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    console.log(`Mock: Registering institution ${name} (${email}) on blockchain`);
    
    // Simulate blockchain transaction
    this.transactionCounter++;
    const mockTxHash = `0x${Math.random().toString(16).substring(2, 10)}${Date.now().toString(16)}`;
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`Mock: Institution registered successfully. TX Hash: ${mockTxHash}`);
    return mockTxHash;
  }

  async authorizeInstitution(walletAddress) {
    if (!this.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    console.log(`Mock: Authorizing institution with wallet ${walletAddress} on blockchain`);
    
    // Simulate blockchain transaction
    this.transactionCounter++;
    const mockTxHash = `0x${Math.random().toString(16).substring(2, 10)}${Date.now().toString(16)}`;
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log(`Mock: Institution authorized successfully. TX Hash: ${mockTxHash}`);
    return mockTxHash;
  }

  async getInstitutionStats(walletAddress) {
    if (!this.isConnected) {
      throw new Error('Wallet not connected');
    }
    
    console.log(`Mock: Getting stats for institution with wallet ${walletAddress}`);
    
    // Simulate blockchain query
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Return mock stats
    return {
      isAuthorized: Math.random() > 0.5, // Random authorization status
      registrationDate: Date.now() - Math.random() * 1000000000, // Random registration date
      certificateCount: Math.floor(Math.random() * 100),
      lastActivity: Date.now() - Math.random() * 86400000 // Random last activity
    };
  }

  async disconnectWallet() {
    console.log('Mock: Disconnecting from blockchain wallet...');
    this.isConnected = false;
    return true;
  }
}

// Export the mock service
export const blockchainService = new MockBlockchainService();

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { blockchainService };
}
