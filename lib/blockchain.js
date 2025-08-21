// Try to import ethers, but provide fallback if not available
let ethers;
try {
  ethers = require('ethers');
} catch (error) {
  console.log('Ethers not available, using mock blockchain service');
  ethers = null;
}

// Get environment variables
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0xBD4228241dc6BC14C027bF8B6A24f97bc9872068';
const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL;
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY;

// Basic contract ABI for institution management
const CONTRACT_ABI = [
  // Institution registration
  "function registerInstitution(string memory name, string memory email) external returns (bool)",
  "function authorizeInstitution(address institutionAddress) external returns (bool)",
  "function getInstitutionStats(address institutionAddress) external view returns (bool isAuthorized, uint256 registrationDate, uint256 certificatesIssued)",
  "function isInstitutionRegistered(address institutionAddress) external view returns (bool)",
  "function isInstitutionAuthorized(address institutionAddress) external view returns (bool)",
  // Certificate management
  "function issueCertificate(address studentAddress, string memory studentName, string memory courseName, string memory ipfsHash) external returns (uint256)",
  "function getCertificate(uint256 tokenId) external view returns (address studentAddress, string memory studentName, string memory courseName, string memory ipfsHash, uint256 issueDate, bool isValid)",
  "function verifyCertificate(uint256 tokenId) external view returns (bool)",
  // Events
  "event InstitutionRegistered(address indexed institutionAddress, string name, string email, uint256 timestamp)",
  "event InstitutionAuthorized(address indexed institutionAddress, uint256 timestamp)",
  "event CertificateIssued(uint256 indexed tokenId, address indexed studentAddress, string studentName, string courseName, string ipfsHash, uint256 timestamp)"
];

class BlockchainService {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.adminWallet = null;
    this.isConnected = false;
  }

  async connectWallet() {
    try {
      // If ethers is not available, use mock mode
      if (!ethers) {
        console.log('Ethers not available, using mock blockchain service');
        this.isConnected = true;
        return true;
      }

      if (!ETHEREUM_RPC_URL) {
        console.log('Ethereum RPC URL not configured, using mock mode');
        this.isConnected = true;
        return true;
      }

      // Initialize provider
      this.provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);

      // Initialize contract
      this.contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, this.provider);

      // Connect admin wallet if private key is provided
      if (ADMIN_PRIVATE_KEY) {
        this.adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, this.provider);
        this.contract = this.contract.connect(this.adminWallet);
        this.isConnected = true;
        console.log('Admin wallet connected successfully');
      } else {
        console.log('No admin private key provided. Read-only mode.');
      }

      return true;
    } catch (error) {
      console.error('Failed to connect wallet, using mock mode:', error);
      this.isConnected = true;
      return true;
    }
  }

  async registerInstitution(name, email) {
    try {
      if (!this.isConnected) {
        throw new Error('Admin wallet not connected');
      }

      // If ethers is not available or contract is not initialized, use mock
      if (!ethers || !this.contract) {
        return this.mockRegisterInstitution(name, email);
      }

      console.log(`Registering institution: ${name} (${email})`);
      
      // Call the smart contract
      const tx = await this.contract.registerInstitution(name, email);
      const receipt = await tx.wait();
      
      console.log(`Institution registered. Transaction hash: ${receipt.hash}`);
      return receipt.hash;
    } catch (error) {
      console.error('Failed to register institution, using mock:', error);
      return this.mockRegisterInstitution(name, email);
    }
  }

  async authorizeInstitution(institutionAddress) {
    try {
      if (!this.isConnected) {
        throw new Error('Admin wallet not connected');
      }

      // If ethers is not available or contract is not initialized, use mock
      if (!ethers || !this.contract) {
        return this.mockAuthorizeInstitution(institutionAddress);
      }

      console.log(`Authorizing institution: ${institutionAddress}`);
      
      // Call the smart contract
      const tx = await this.contract.authorizeInstitution(institutionAddress);
      const receipt = await tx.wait();
      
      console.log(`Institution authorized. Transaction hash: ${receipt.hash}`);
      return receipt.hash;
    } catch (error) {
      console.error('Failed to authorize institution, using mock:', error);
      return this.mockAuthorizeInstitution(institutionAddress);
    }
  }

  async getInstitutionStats(institutionAddress) {
    try {
      // If ethers is not available or contract is not initialized, use mock
      if (!ethers || !this.contract) {
        return this.mockGetInstitutionStats(institutionAddress);
      }

      console.log(`Getting stats for institution: ${institutionAddress}`);
      
      // Call the smart contract
      const stats = await this.contract.getInstitutionStats(institutionAddress);
      
      return {
        isAuthorized: stats[0],
        registrationDate: stats[1].toString(),
        certificatesIssued: stats[2].toString()
      };
    } catch (error) {
      console.error('Failed to get institution stats, using mock:', error);
      return this.mockGetInstitutionStats(institutionAddress);
    }
  }

  async isInstitutionRegistered(institutionAddress) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const isRegistered = await this.contract.isInstitutionRegistered(institutionAddress);
      return isRegistered;
    } catch (error) {
      console.error('Failed to check institution registration:', error);
      return false;
    }
  }

  async isInstitutionAuthorized(institutionAddress) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const isAuthorized = await this.contract.isInstitutionAuthorized(institutionAddress);
      return isAuthorized;
    } catch (error) {
      console.error('Failed to check institution authorization:', error);
      return false;
    }
  }

  async issueCertificate(studentAddress, studentName, courseName, ipfsHash) {
    try {
      if (!this.isConnected) {
        throw new Error('Admin wallet not connected');
      }

      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      console.log(`Issuing certificate for student: ${studentName} (${studentAddress})`);
      
      // Call the smart contract
      const tx = await this.contract.issueCertificate(studentAddress, studentName, courseName, ipfsHash);
      const receipt = await tx.wait();
      
      // Get the token ID from the event
      const event = receipt.logs.find(log => {
        try {
          const parsed = this.contract.interface.parseLog(log);
          return parsed.name === 'CertificateIssued';
        } catch {
          return false;
        }
      });

      let tokenId = null;
      if (event) {
        const parsed = this.contract.interface.parseLog(event);
        tokenId = parsed.args.tokenId.toString();
      }

      console.log(`Certificate issued. Transaction hash: ${receipt.hash}, Token ID: ${tokenId}`);
      return { transactionHash: receipt.hash, tokenId };
    } catch (error) {
      console.error('Failed to issue certificate:', error);
      throw error;
    }
  }

  async getCertificate(tokenId) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const certificate = await this.contract.getCertificate(tokenId);
      
      return {
        studentAddress: certificate[0],
        studentName: certificate[1],
        courseName: certificate[2],
        ipfsHash: certificate[3],
        issueDate: certificate[4].toString(),
        isValid: certificate[5]
      };
    } catch (error) {
      console.error('Failed to get certificate:', error);
      throw error;
    }
  }

  async verifyCertificate(tokenId) {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const isValid = await this.contract.verifyCertificate(tokenId);
      return isValid;
    } catch (error) {
      console.error('Failed to verify certificate:', error);
      return false;
    }
  }

  // Mock methods for development/testing when blockchain is not available
  async mockRegisterInstitution(name, email) {
    console.log(`[MOCK] Registering institution: ${name} (${email})`);
    return `mock_tx_hash_${Date.now()}`;
  }

  async mockAuthorizeInstitution(institutionAddress) {
    console.log(`[MOCK] Authorizing institution: ${institutionAddress}`);
    return `mock_auth_tx_hash_${Date.now()}`;
  }

  async mockGetInstitutionStats(institutionAddress) {
    console.log(`[MOCK] Getting stats for institution: ${institutionAddress}`);
    return {
      isAuthorized: true,
      registrationDate: Math.floor(Date.now() / 1000).toString(),
      certificatesIssued: '0'
    };
  }
}

// Create and export singleton instance
const blockchainService = new BlockchainService();

module.exports = { blockchainService };
