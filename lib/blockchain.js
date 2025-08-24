import { ethers } from 'ethers';

// Contract ABI for EduChain Certificate Contract
const CONTRACT_ABI = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "studentAddress",
        "type": "address"
      },
      {
        "internalType": "string",
        "name": "studentName",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "courseName",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "grade",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "ipfsHash",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "completionDate",
        "type": "uint256"
      },
      {
        "internalType": "string",
        "name": "certificateType",
        "type": "string"
      }
    ],
    "name": "issueCertificate",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "verifyCertificate",
    "outputs": [
      {
        "components": [
          {
            "internalType": "string",
            "name": "studentName",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "institutionName",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "courseName",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "grade",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "issueDate",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "ipfsHash",
            "type": "string"
          },
          {
            "internalType": "bool",
            "name": "isValid",
            "type": "bool"
          },
          {
            "internalType": "address",
            "name": "issuedBy",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "completionDate",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "certificateType",
            "type": "string"
          }
        ],
        "internalType": "struct CertificateNFT.Certificate",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "ipfsHash",
        "type": "string"
      }
    ],
    "name": "verifyCertificateByIPFS",
    "outputs": [
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      },
      {
        "components": [
          {
            "internalType": "string",
            "name": "studentName",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "institutionName",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "courseName",
            "type": "string"
          },
          {
            "internalType": "string",
            "name": "grade",
            "type": "string"
          },
          {
            "internalType": "uint256",
            "name": "issueDate",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "ipfsHash",
            "type": "string"
          },
          {
            "internalType": "bool",
            "name": "isValid",
            "type": "bool"
          },
          {
            "internalType": "address",
            "name": "issuedBy",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "completionDate",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "certificateType",
            "type": "string"
          }
        ],
        "internalType": "struct CertificateNFT.Certificate",
        "name": "cert",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "studentAddress",
        "type": "address"
      }
    ],
    "name": "getStudentCertificates",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "tokenId",
        "type": "uint256"
      }
    ],
    "name": "revokeCertificate",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "string",
        "name": "email",
        "type": "string"
      }
    ],
    "name": "registerInstitution",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "institutionAddress",
        "type": "address"
      }
    ],
    "name": "getInstitutionStats",
    "outputs": [
      {
        "internalType": "string",
        "name": "name",
        "type": "string"
      },
      {
        "internalType": "bool",
        "name": "isAuthorized",
        "type": "bool"
      },
      {
        "internalType": "uint256",
        "name": "registrationDate",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "certificatesIssued",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

class BaseMainnetBlockchainService {
  constructor() {
    this.provider = null;
    this.contract = null;
    this.signer = null;
    this.isConnected = false;
    
    // Base mainnet configuration
    this.contractAddress = process.env.CONTRACT_ADDRESS || '0xBD4228241dc6BC14C027bF8B6A24f97bc9872068';
    this.rpcUrl = process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org';
    this.privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;
    
    this.initializeProvider();
  }

  initializeProvider() {
    try {
      // Initialize provider for Base mainnet
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
      
      // Initialize contract instance
      this.contract = new ethers.Contract(this.contractAddress, CONTRACT_ABI, this.provider);
      
      console.log('Blockchain service initialized for Base mainnet');
      console.log(`Contract address: ${this.contractAddress}`);
      console.log(`RPC URL: ${this.rpcUrl}`);
      
    } catch (error) {
      console.error('Failed to initialize blockchain provider:', error);
      throw new Error('Blockchain service initialization failed');
    }
  }

  async connectWallet() {
    try {
      if (!this.privateKey) {
        throw new Error('Blockchain private key not configured');
      }

      // Create signer from private key
      this.signer = new ethers.Wallet(this.privateKey, this.provider);
      
      // Connect contract with signer for write operations
      this.contract = this.contract.connect(this.signer);
      
      this.isConnected = true;
      
      const address = await this.signer.getAddress();
      console.log(`Connected to blockchain with address: ${address}`);
      
      return address;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      throw new Error(`Wallet connection failed: ${error.message}`);
    }
  }

  async issueCertificate(
    studentAddress,
    studentName,
    courseName,
    grade,
    ipfsHash,
    completionDate,
    certificateType
  ) {
    if (!this.isConnected || !this.signer) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log('Issuing certificate on blockchain...');
      console.log(`Student: ${studentName} (${studentAddress})`);
      console.log(`Course: ${courseName}`);
      console.log(`IPFS Hash: ${ipfsHash}`);

      // Convert completion date to timestamp if it's a Date object
      const completionTimestamp = completionDate instanceof Date 
        ? Math.floor(completionDate.getTime() / 1000)
        : completionDate;
      
      // Call the smart contract
      const tx = await this.contract.issueCertificate(
        studentAddress,
        studentName,
        courseName,
        grade,
        ipfsHash,
        completionTimestamp,
        certificateType
      );

      console.log(`Transaction sent: ${tx.hash}`);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      
      console.log(`Certificate issued successfully!`);
      console.log(`Transaction hash: ${receipt.hash}`);
      console.log(`Block number: ${receipt.blockNumber}`);
      
      // Get the token ID from the event
      const event = receipt.logs.find((log) => {
        try {
          const parsedLog = this.contract.interface.parseLog(log);
          return parsedLog.name === 'CertificateIssued';
        } catch {
          return false;
        }
      });

      let tokenId = null;
      if (event) {
        const parsedLog = this.contract.interface.parseLog(event);
        tokenId = parsedLog.args.tokenId.toString();
        console.log(`Token ID: ${tokenId}`);
      }

      return {
        success: true,
        transactionHash: receipt.hash,
        tokenId: tokenId,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      console.error('Failed to issue certificate on blockchain:', error);
      throw new Error(`Certificate issuance failed: ${error.message}`);
    }
  }

  async verifyCertificate(tokenId) {
    try {
      console.log(`Verifying certificate with token ID: ${tokenId}`);

      const certificate = await this.contract.verifyCertificate(tokenId);
      
      return {
        exists: true,
        tokenId: tokenId,
        certificate: {
          studentName: certificate.studentName,
          institutionName: certificate.institutionName,
          courseName: certificate.courseName,
          grade: certificate.grade,
          issueDate: certificate.issueDate.toString(),
          ipfsHash: certificate.ipfsHash,
          isValid: certificate.isValid,
          issuedBy: certificate.issuedBy,
          completionDate: certificate.completionDate.toString(),
          certificateType: certificate.certificateType
        }
      };

    } catch (error) {
      console.error('Failed to verify certificate:', error);
      throw new Error(`Certificate verification failed: ${error.message}`);
    }
  }

  async verifyCertificateByIPFS(ipfsHash) {
    try {
      console.log(`Verifying certificate with IPFS hash: ${ipfsHash}`);

      const result = await this.contract.verifyCertificateByIPFS(ipfsHash);
      
      if (!result.exists) {
        return { exists: false, tokenId: null, certificate: null };
      }
      
      return {
        exists: true,
        tokenId: result.tokenId.toString(),
        certificate: {
          studentName: result.cert.studentName,
          institutionName: result.cert.institutionName,
          courseName: result.cert.courseName,
          grade: result.cert.grade,
          issueDate: result.cert.issueDate.toString(),
          ipfsHash: result.cert.ipfsHash,
          isValid: result.cert.isValid,
          issuedBy: result.cert.issuedBy,
          completionDate: result.cert.completionDate.toString(),
          certificateType: result.cert.certificateType
        }
      };

    } catch (error) {
      console.error('Failed to verify certificate by IPFS:', error);
      throw new Error(`IPFS verification failed: ${error.message}`);
    }
  }

  async getStudentCertificates(studentAddress) {
    try {
      console.log(`Getting certificates for student: ${studentAddress}`);

      const certificateIds = await this.contract.getStudentCertificates(studentAddress);
      
      return certificateIds.map(id => id.toString());

    } catch (error) {
      console.error('Failed to get student certificates:', error);
      throw new Error(`Failed to get student certificates: ${error.message}`);
    }
  }

  async revokeCertificate(tokenId) {
    if (!this.isConnected || !this.signer) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log(`Revoking certificate with token ID: ${tokenId}`);

      const tx = await this.contract.revokeCertificate(tokenId);
      
      console.log(`Revocation transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      
      console.log(`Certificate revoked successfully!`);
      console.log(`Transaction hash: ${receipt.hash}`);
      
      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString()
      };

    } catch (error) {
      console.error('Failed to revoke certificate:', error);
      throw new Error(`Certificate revocation failed: ${error.message}`);
    }
  }

  async registerInstitution(name, email) {
    if (!this.isConnected || !this.signer) {
      throw new Error('Wallet not connected');
    }

    try {
      console.log(`Registering institution: ${name} (${email})`);

      // First, check if the institution is already registered
      try {
        const stats = await this.contract.getInstitutionStats(this.signer.address);
        if (stats.registrationDate > 0) {
          console.log(`Institution ${name} is already registered on blockchain`);
          return {
            alreadyRegistered: true,
            message: 'Institution already registered on blockchain'
          };
        }
      } catch (checkError) {
        // If getInstitutionStats fails, it might mean the institution is not registered
        // Continue with registration
        console.log('Institution not found on blockchain, proceeding with registration');
      }

      const tx = await this.contract.registerInstitution(name, email);
      
      console.log(`Registration transaction sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      
      console.log(`Institution registered successfully!`);
      console.log(`Transaction hash: ${receipt.hash}`);
      
      return {
        alreadyRegistered: false,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber
      };

    } catch (error) {
      console.error('Failed to register institution:', error);
      
      // Check if the error is "Already registered"
      if (error.message && error.message.includes('Already registered')) {
        console.log('Institution is already registered on blockchain');
        return {
          alreadyRegistered: true,
          message: 'Institution already registered on blockchain'
        };
      }
      
      throw new Error(`Institution registration failed: ${error.message}`);
    }
  }

  async getInstitutionStats(institutionAddress) {
    try {
      console.log(`Getting stats for institution: ${institutionAddress}`);

      const stats = await this.contract.getInstitutionStats(institutionAddress);
      
      return {
        name: stats.name,
        isAuthorized: stats.isAuthorized,
        registrationDate: stats.registrationDate.toString(),
        certificatesIssued: stats.certificatesIssued.toString()
      };

    } catch (error) {
      console.error('Failed to get institution stats:', error);
      throw new Error(`Failed to get institution stats: ${error.message}`);
    }
  }

  async isInstitutionRegistered(institutionAddress) {
    try {
      console.log(`Checking if institution is registered: ${institutionAddress}`);
      
      const stats = await this.contract.getInstitutionStats(institutionAddress);
      const isRegistered = stats.registrationDate > 0;
      
      console.log(`Institution ${institutionAddress} registration status: ${isRegistered}`);
      
      return {
        isRegistered,
        isAuthorized: stats.isAuthorized,
        registrationDate: stats.registrationDate.toString(),
        name: stats.name
      };

    } catch (error) {
      console.log(`Institution ${institutionAddress} not found on blockchain`);
      return {
        isRegistered: false,
        isAuthorized: false,
        registrationDate: '0',
        name: ''
      };
    }
  }

  async disconnectWallet() {
    this.signer = null;
    this.isConnected = false;
    console.log('Disconnected from blockchain wallet');
    return true;
  }

  // Get current connection status
  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      contractAddress: this.contractAddress,
      rpcUrl: this.rpcUrl,
      hasPrivateKey: !!this.privateKey
    };
  }
}

// Create and export the blockchain service instance
export const blockchainService = new BaseMainnetBlockchainService();

// For CommonJS compatibility
if (typeof module !== 'undefined' && module.exports) {
module.exports = { blockchainService };
}
