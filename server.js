import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import mongoose from 'mongoose';
import multer from 'multer';
import { uploadToPinata } from './services/pinata.js';
import Certificate from './models/Certificate.js';
import Institution from './models/Institution.js';
import Subscription from './models/Subscription.js';
import Payment from './models/Payment.js';
import VerificationRequest from './models/VerificationRequest.js';
import Student from './models/Student.js';

const mongoUri = process.env.MONGODB_URI_LOCAL || process.env.MONGODB_URI;

mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log(`MongoDB connected! (${mongoUri})`))
.catch((err) => console.error('MongoDB connection error:', err));

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5000',
    'http://localhost:3000',
    'http://localhost:5173', // Vite dev server
    'http://localhost:4173', // Vite preview
    'educhain-ay1yzm1pd-educhain-devs-projects.vercel.app',
    'https://educhain-frontend-git-main.vercel.app',
    process.env.FRONTEND_URL
  ].filter(Boolean), // Remove undefined values
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'admin-email', 'Content-Length', 'X-Requested-With', 'Origin', 'Accept'],
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
}));

// Add preflight handler for all routes
app.options('*', cors());
app.use(express.json());

// Middleware to check if user is admin (for verification purposes)
const isAdmin = (req, res, next) => {
  try {
    // In production, implement proper admin authentication
    const adminEmail = req.headers['admin-email'];
    console.log('Admin check - Email:', adminEmail, 'Headers:', req.headers);
    
    if (!adminEmail) {
      console.log('Admin access denied: No admin-email header');
      return res.status(403).json({ error: 'Admin access required - admin-email header missing' });
    }
    
    if (adminEmail === 'admin@educhain.com') {
      console.log('Admin access granted for:', adminEmail);
      next();
    } else {
      console.log('Admin access denied for email:', adminEmail);
      return res.status(403).json({ error: 'Admin access required - invalid admin email' });
    }
  } catch (error) {
    console.error('Admin middleware error:', error);
    return res.status(500).json({ error: 'Internal server error in admin authentication' });
  }
};

// Global error handler to ensure JSON responses
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // Ensure we always return JSON
  res.setHeader('Content-Type', 'application/json');
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Validation error', details: err.message });
  }
  
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'Invalid ID format' });
  }
  
  if (err.code === 11000) {
    return res.status(400).json({ error: 'Duplicate field value' });
  }
  
  return res.status(500).json({ error: 'Internal server error' });
});

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.status(404).json({ error: 'Route not found', path: req.originalUrl });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    message: 'EduChain backend is running'
  });
});

// Test admin endpoint
app.get('/api/admin/test', isAdmin, (req, res) => {
  res.json({ 
    status: 'ok', 
    message: 'Admin authentication working',
    timestamp: new Date().toISOString(),
    adminEmail: req.headers['admin-email']
  });
});

// Request logging middleware
app.use((req, res, next) => {
  const adminEmail = req.headers['admin-email'];
  const allHeaders = Object.keys(req.headers).map(key => `${key}: ${req.headers[key]}`).join(', ');
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path} - Origin: ${req.headers.origin} - Admin-Email: ${adminEmail || 'undefined'} - All Headers: ${allHeaders}`);
  next();
});

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// In-memory storage for institutions (in production, use a database)
// const verificationRequests = []; // Removed unused variable
// const subscriptions = []; // Removed unused variable

// Replace the old SUBSCRIPTION_PLANS with the import from pricing config
let SUBSCRIPTION_PLANS;
try {
  const PRICING_CONFIG = await import('./config/pricing.js');
  SUBSCRIPTION_PLANS = PRICING_CONFIG.default.plans;
  if (!SUBSCRIPTION_PLANS) throw new Error('Pricing config missing plans');
} catch (err) {
  console.error('Failed to load pricing config:', err);
  // Fallback default plans to prevent crash
  SUBSCRIPTION_PLANS = {
    basic: { price: 29.99, currency: 'USD', limits: { certificatesPerMonth: 100, storageGB: 1, apiCalls: 1000 } },
    professional: { price: 99.99, currency: 'USD', limits: { certificatesPerMonth: 500, storageGB: 10, apiCalls: 5000 } },
    enterprise: { price: 299.99, currency: 'USD', limits: { certificatesPerMonth: -1, storageGB: 100, apiCalls: 50000 } }
  };
}

// JWT secret (in production, use environment variable)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Student wallet connect (login via wallet)
app.post('/api/students/connect-wallet', async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    // Find student by wallet address
    const student = await Student.findOne({ walletAddress: new RegExp(`^${walletAddress}$`, 'i') });
    if (!student) {
      return res.status(404).json({ error: 'No student found for this wallet address' });
    }
    // Check if student has at least one certificate
    const certCount = await Certificate.countDocuments({ studentAddress: new RegExp(`^${walletAddress}$`, 'i') });
    if (certCount === 0) {
      return res.status(403).json({ error: 'No valid certificate found for this wallet address' });
    }
    // Issue JWT
    const token = jwt.sign(
      {
        studentId: student._id,
        name: student.name,
        walletAddress: student.walletAddress,
        email: student.email
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ message: 'Wallet connected, JWT issued', token, student });
  } catch (error) {
    console.error('Wallet connect error:', error);
    res.status(500).json({ error: 'Internal server error during wallet connect' });
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Register institution
app.post('/api/institutions/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      walletAddress,
      registrationNumber,
      contactInfo,
      verificationDocuments
    } = req.body;

    if (!name || !email || !password || !walletAddress || !registrationNumber) {
      return res.status(400).json({
        error: 'Missing required fields: name, email, password, walletAddress, registrationNumber'
      });
    }

    // Check if email or wallet already exists in DB
    const existingInstitution = await Institution.findOne({ $or: [{ email }, { walletAddress }] });
    if (existingInstitution) {
      return res.status(400).json({ error: 'Institution with this email or wallet address already exists' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newInstitution = new Institution({
      name,
      email,
      password: hashedPassword,
      walletAddress,
      registrationNumber,
      contactInfo: contactInfo || {},
      verificationDocuments: verificationDocuments || []
    });
    await newInstitution.save();

    // Create JWT token
    const token = jwt.sign(
      {
        institutionId: newInstitution._id,
        name: newInstitution.name,
        walletAddress: newInstitution.walletAddress,
        email: newInstitution.email,
        isVerified: newInstitution.isVerified
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const { password: _, ...institutionWithoutPassword } = newInstitution.toObject();
    res.status(201).json({
      message: 'Institution registered successfully. Verification request submitted.',
      institution: institutionWithoutPassword,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login institution
app.post('/api/institutions/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const institution = await Institution.findOne({ email });
    if (!institution) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const isPasswordValid = await bcrypt.compare(password, institution.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      {
        institutionId: institution._id,
        name: institution.name,
        walletAddress: institution.walletAddress,
        email: institution.email,
        isVerified: institution.isVerified
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    const { password: _, ...institutionWithoutPassword } = institution.toObject();
    res.json({ message: 'Login successful', institution: institutionWithoutPassword, token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Get institution profile (protected route)
app.get('/api/institutions/profile', authenticateToken, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId).select('-password');
    if (!institution) {
      return res.status(404).json({ error: 'Institution not found' });
    }
    res.json({ institution });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get institution verification status
app.get('/api/institutions/verification-status', authenticateToken, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId);
    
    if (!institution) {
      return res.status(404).json({
        error: 'Institution not found'
      });
    }

    res.json({
      isVerified: institution.isVerified,
      verificationStatus: institution.verificationStatus,
      verificationDocuments: institution.verificationDocuments
    });

  } catch (error) {
    console.error('Get verification status error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Submit verification documents

app.post('/api/institutions/verification-documents', authenticateToken, upload.array('documents'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No documents uploaded' });
    }

    const documents = [];
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const documentType = req.body[`type${i}`] || 'Other';
      const description = req.body[`description${i}`] || '';
      try {
        const url = await uploadToPinata(file.buffer, file.originalname);
        documents.push({
          type: documentType,
          description: description,
          url: url,
          originalName: file.originalname
        });
      } catch (uploadError) {
        console.error('File upload error:', uploadError);
        continue;
      }
    }

    if (!documents.length) {
      return res.status(400).json({ error: 'No documents were processed successfully' });
    }

    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) {
      return res.status(404).json({ error: 'Institution not found' });
    }

    institution.verificationDocuments = documents;
    institution.verificationStatus = 'pending';
    await institution.save();

    let verificationRequest = await VerificationRequest.findOne({ institutionId: institution._id });
    if (verificationRequest) {
      verificationRequest.documents = documents;
      verificationRequest.status = 'pending';
      verificationRequest.submittedAt = new Date();
      await verificationRequest.save();
    } else {
      verificationRequest = new VerificationRequest({
        institutionId: institution._id,
        institutionName: institution.name,
        institutionEmail: institution.email,
        registrationNumber: institution.registrationNumber,
        documents,
        status: 'pending',
        submittedAt: new Date()
      });
      await verificationRequest.save();
    }

    res.json({
      message: 'Verification documents submitted successfully',
      documents,
      verificationRequestId: verificationRequest._id
    });
  } catch (error) {
    console.error('Verification documents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Check usage limits before certificate issuance
const checkUsageLimits = async (institutionId) => {
  const subscription = await Subscription.findOne({ institutionId });
  if (!subscription || subscription.status !== 'active') {
    return { allowed: false, reason: 'No active subscription' };
  }
  const plan = SUBSCRIPTION_PLANS[subscription.planId];
  const usage = {
    certificatesThisMonth: 45,
    storageUsed: 0.5,
    apiCallsThisMonth: 234
  };
  if (plan.limits.certificatesPerMonth !== -1 && usage.certificatesThisMonth >= plan.limits.certificatesPerMonth) {
    return { allowed: false, reason: 'Monthly certificate limit reached' };
  }
  if (usage.storageUsed >= plan.limits.storageGB) {
    return { allowed: false, reason: 'Storage limit reached' };
  }
  return { allowed: true };
};

// Modified admin verification approval to include blockchain registration
app.post('/api/admin/verification-requests/:requestId/review', isAdmin, async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status, comments } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        error: 'Status must be either "approved" or "rejected"'
      });
    }

    const verificationRequest = await VerificationRequest.findById(requestId);
    if (!verificationRequest) {
      return res.status(404).json({
        error: 'Verification request not found'
      });
    }

    const institution = await Institution.findById(verificationRequest.institutionId);
    if (!institution) {
      return res.status(404).json({
        error: 'Institution not found'
      });
    }

    // Update verification request
    verificationRequest.status = status;
    verificationRequest.reviewedAt = new Date();
    verificationRequest.reviewedBy = req.headers['admin-email'];
    verificationRequest.comments = comments;
    await verificationRequest.save();

    // Update institution verification status
    if (status === 'approved') {
      institution.isVerified = true;
      institution.verificationStatus = 'approved';
      
      // NEW: Register institution on blockchain
      try {
        // Check if blockchain service exists
        let blockchainService;
        try {
          const blockchainModule = await import('./lib/blockchain.js');
          blockchainService = blockchainModule.blockchainService;
        } catch (importError) {
          console.error('Blockchain service not available:', importError.message);
          // Allow backend verification but flag for manual blockchain registration
          institution.blockchainRegistered = false;
          institution.blockchainError = 'Blockchain service not configured';
          await institution.save();
          return res.json({
            message: `Verification request ${status}`,
            institution,
            blockchainRegistered: false,
            blockchainError: 'Blockchain service not configured'
          });
        }
        
        // Connect admin wallet (you'll need to set this up)
        await blockchainService.connectWallet();
        
        // Register institution on blockchain
        const registrationResult = await blockchainService.registerInstitution(
          institution.name,
          institution.email
        );
        
        if (registrationResult.alreadyRegistered) {
          console.log(`Institution ${institution.name} already registered on blockchain`);
          institution.blockchainRegistered = true;
          institution.blockchainError = null;
        } else {
          console.log(`Institution ${institution.name} registered on blockchain. TX: ${registrationResult.transactionHash}`);
          institution.blockchainRegistered = true;
          institution.blockchainTxHash = registrationResult.transactionHash;
          institution.blockchainRegistrationDate = new Date();
        }
        
      } catch (blockchainError) {
        console.error('Failed to register institution on blockchain:', blockchainError);
        
        // Allow backend verification but flag for manual blockchain registration
        institution.blockchainRegistered = false;
        institution.blockchainError = blockchainError.message;
      }
    } else {
      institution.isVerified = false;
      institution.verificationStatus = 'rejected';
    }
    
    await institution.save();

    res.json({
      message: `Verification request ${status}`,
      institution,
      blockchainRegistered: institution.blockchainRegistered
    });

  } catch (error) {
    console.error('Review verification request error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Enhanced: Manual blockchain registration endpoint for already verified institutions
app.post('/api/admin/institutions/:institutionId/blockchain-register', isAdmin, async (req, res) => {
  try {
    const { institutionId } = req.params;
    
    const institution = await Institution.findById(institutionId);
    if (!institution) {
      return res.status(404).json({ error: 'Institution not found' });
    }
    
    if (!institution.isVerified) {
      return res.status(400).json({ error: 'Institution must be verified first' });
    }
    
         // Check if already registered on blockchain
     try {
       let blockchainService;
       try {
         const blockchainModule = await import('./lib/blockchain.js');
         blockchainService = blockchainModule.blockchainService;
       } catch (importError) {
         console.error('Blockchain service not available:', importError.message);
         return res.status(500).json({ 
           error: 'Blockchain service not configured',
           details: 'Please configure the blockchain service before checking blockchain status'
         });
       }
       
       await blockchainService.connectWallet();
       
       const stats = await blockchainService.getInstitutionStats(institution.walletAddress);
      
      if (stats.isAuthorized) {
        // Update database to reflect blockchain status
        institution.blockchainRegistered = true;
        institution.blockchainAuthorized = true;
        institution.blockchainError = null;
        await institution.save();
        
        return res.json({
          message: 'Institution already authorized on blockchain',
          institution,
          blockchainStatus: 'already_authorized'
        });
      }
      
      if (stats.registrationDate > 0) {
        // Registered but not authorized - you might need to call authorize function
        institution.blockchainRegistered = true;
        institution.blockchainAuthorized = false;
        await institution.save();
        
        return res.json({
          message: 'Institution registered but not authorized on blockchain',
          institution,
          blockchainStatus: 'registered_not_authorized'
        });
      }
    } catch (statsError) {
      console.log('Institution not found on blockchain, proceeding with registration...');
    }
    
    if (institution.blockchainRegistered) {
      return res.status(400).json({ error: 'Institution already registered on blockchain' });
    }
    
    // Register on blockchain
    let blockchainService;
    try {
      const blockchainModule = await import('./lib/blockchain.js');
      blockchainService = blockchainModule.blockchainService;
    } catch (importError) {
      console.error('Blockchain service not available:', importError.message);
      return res.status(500).json({ 
        error: 'Blockchain service not configured',
        details: 'Please configure the blockchain service before registering institutions'
      });
    }
    
    await blockchainService.connectWallet();
    
    const registrationResult = await blockchainService.registerInstitution(
      institution.name,
      institution.email
    );
    
    if (registrationResult.alreadyRegistered) {
      // Update institution record for already registered
      institution.blockchainRegistered = true;
      institution.blockchainError = null;
      await institution.save();
      
      res.json({
        message: 'Institution already registered on blockchain',
        institution,
        blockchainStatus: 'already_registered'
      });
    } else {
      // Update institution record for new registration
      institution.blockchainRegistered = true;
      institution.blockchainTxHash = registrationResult.transactionHash;
      institution.blockchainRegistrationDate = new Date();
      institution.blockchainError = null;
      await institution.save();
      
      res.json({
        message: 'Institution registered on blockchain successfully',
        transactionHash: registrationResult.transactionHash,
        institution,
        blockchainStatus: 'registered'
      });
    }
    
  } catch (error) {
    console.error('Blockchain registration error:', error);
    
    // Update institution with error
    const institution = await Institution.findById(institutionId);
    if (institution) {
      institution.blockchainError = error.message;
      await institution.save();
    }
    
    res.status(500).json({ 
      error: 'Failed to register on blockchain',
      details: error.message 
    });
  }
});

// Blockchain configuration endpoints
app.get('/api/blockchain/config', async (req, res) => {
  try {
    const config = {
      contractAddress: process.env.CONTRACT_ADDRESS || '0xBD4228241dc6BC14C027bF8B6A24f97bc9872068',
      rpcUrl: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
      hasABI: true, // We have the ABI in the frontend
      network: 'base-mainnet',
      chainId: 8453
    };
    
    res.json(config);
  } catch (error) {
    console.error('Error fetching blockchain config:', error);
    res.status(500).json({ error: 'Failed to fetch blockchain configuration' });
  }
});

app.get('/api/blockchain/network', async (req, res) => {
  try {
    res.json({
      chainId: 8453,
      name: 'Base Mainnet',
      network: 'base-mainnet',
      explorer: 'https://basescan.org'
    });
  } catch (error) {
    console.error('Error fetching network info:', error);
    res.status(500).json({ error: 'Failed to fetch network information' });
  }
});

// Institution blockchain status endpoint
app.get('/api/institutions/:institutionId/blockchain-status', async (req, res) => {
  try {
    const { institutionId } = req.params;
    
    const institution = await Institution.findById(institutionId);
    if (!institution) {
      return res.status(404).json({ error: 'Institution not found' });
    }
    
    res.json({
      institutionId,
      blockchainRegistered: institution.blockchainRegistered || false,
      blockchainAuthorized: institution.blockchainAuthorized || false,
      blockchainError: institution.blockchainError || null,
      blockchainTxHash: institution.blockchainTxHash || null,
      blockchainRegistrationDate: institution.blockchainRegistrationDate || null
    });
  } catch (error) {
    console.error('Error fetching blockchain status:', error);
    res.status(500).json({ error: 'Failed to fetch blockchain status' });
  }
});

// NEW: Bulk blockchain registration for all verified institutions
app.post('/api/admin/blockchain-register-all', isAdmin, async (req, res) => {
  try {
    // Find all verified institutions that aren't blockchain registered
    const institutions = await Institution.find({ 
      isVerified: true,
      $or: [
        { blockchainRegistered: { $ne: true } },
        { blockchainRegistered: { $exists: false } }
      ]
    });

    console.log(`Found ${institutions.length} institutions to register/authorize`);

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Connect admin wallet once
    let blockchainService;
    try {
      const blockchainModule = await import('./lib/blockchain.js');
      blockchainService = blockchainModule.blockchainService;
    } catch (importError) {
      console.error('Blockchain service not available:', importError.message);
      return res.status(500).json({ 
        error: 'Blockchain service not configured',
        details: 'Please configure the blockchain service before performing bulk registration'
      });
    }
    
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
            institution.blockchainError = null;
            await institution.save();
            
            results.push({
              institution: institution.name,
              status: 'already_authorized',
              message: 'Already authorized on blockchain'
            });
            successCount++;
            continue;
          }
          
          if (stats.registrationDate > 0) {
            console.log(`${institution.name} is registered but not authorized`);
            institution.blockchainRegistered = true;
            institution.blockchainAuthorized = false;
            await institution.save();
            
            results.push({
              institution: institution.name,
              status: 'registered_not_authorized',
              message: 'Registered but not authorized'
            });
            successCount++;
            continue;
          }
        } catch (statsError) {
          console.log(`${institution.name} not found on blockchain, registering...`);
        }
        
        // Register institution on blockchain
        const registrationResult = await blockchainService.registerInstitution(
          institution.name,
          institution.email
        );
        
        if (registrationResult.alreadyRegistered) {
          console.log(`✅ ${institution.name} already registered on blockchain`);
          
          // Update database
          institution.blockchainRegistered = true;
          institution.blockchainError = null;
          await institution.save();
          
          results.push({
            institution: institution.name,
            status: 'already_registered',
            message: 'Already registered on blockchain'
          });
        } else {
          console.log(`✅ ${institution.name} registered on blockchain. TX: ${registrationResult.transactionHash}`);
          
          // Update database
          institution.blockchainRegistered = true;
          institution.blockchainTxHash = registrationResult.transactionHash;
          institution.blockchainRegistrationDate = new Date();
          institution.blockchainError = null;
          await institution.save();
          
          results.push({
            institution: institution.name,
            status: 'registered',
            message: 'Successfully registered',
            transactionHash: registrationResult.transactionHash
          });
        }
        successCount++;
        
        // Wait a bit between transactions to avoid nonce issues
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Failed to register ${institution.name}:`, error.message);
        institution.blockchainError = error.message;
        await institution.save();
        
        results.push({
          institution: institution.name,
          status: 'error',
          message: error.message
        });
        errorCount++;
      }
    }
    
    res.json({
      message: 'Bulk blockchain registration complete',
      summary: {
        total: institutions.length,
        successful: successCount,
        errors: errorCount
      },
      results
    });
    
  } catch (error) {
    console.error('Bulk blockchain registration error:', error);
    res.status(500).json({ 
      error: 'Failed to perform bulk blockchain registration',
      details: error.message 
    });
  }
});

// NEW: Get blockchain registration status for all institutions
app.get('/api/admin/blockchain-status', isAdmin, async (req, res) => {
  try {
    const institutions = await Institution.find({ isVerified: true });
    
    const statusReport = [];
    
    for (const institution of institutions) {
              try {
          const { blockchainService } = require('./lib/blockchain.js');
          const stats = await blockchainService.getInstitutionStats(institution.walletAddress);
        
        statusReport.push({
          id: institution._id,
          name: institution.name,
          email: institution.email,
          walletAddress: institution.walletAddress,
          backendVerified: institution.isVerified,
          blockchainRegistered: institution.blockchainRegistered,
          blockchainAuthorized: stats.isAuthorized,
          blockchainStats: stats,
          blockchainError: institution.blockchainError
        });
      } catch (error) {
        statusReport.push({
          id: institution._id,
          name: institution.name,
          email: institution.email,
          walletAddress: institution.walletAddress,
          backendVerified: institution.isVerified,
          blockchainRegistered: institution.blockchainRegistered,
          blockchainAuthorized: false,
          blockchainStats: null,
          blockchainError: error.message
        });
      }
    }
    
    res.json({
      totalInstitutions: institutions.length,
      statusReport
    });
    
  } catch (error) {
    console.error('Blockchain status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// NEW: Authorize institution on blockchain (separate from registration)
app.post('/api/admin/institutions/:institutionId/blockchain-authorize', isAdmin, async (req, res) => {
  try {
    const { institutionId } = req.params;
    
    const institution = await Institution.findById(institutionId);
    if (!institution) {
      return res.status(404).json({ error: 'Institution not found' });
    }
    
    if (!institution.isVerified) {
      return res.status(400).json({ error: 'Institution must be verified first' });
    }
    
    if (!institution.blockchainRegistered) {
      return res.status(400).json({ error: 'Institution must be registered on blockchain first' });
    }
    
    // Authorize institution on blockchain
    const { blockchainService } = require('./lib/blockchain.js');
    await blockchainService.connectWallet();
    
    try {
      // Call authorize function on smart contract
      const txHash = await blockchainService.authorizeInstitution(institution.walletAddress);
      
             // Update institution record
       institution.blockchainAuthorized = true;
       institution.blockchainAuthTxHash = txHash;
       institution.blockchainAuthorizationDate = new Date();
       institution.blockchainError = null;
       await institution.save();
      
      res.json({
        message: 'Institution authorized on blockchain successfully',
        transactionHash: txHash,
        institution,
        blockchainStatus: 'authorized'
      });
      
    } catch (authError) {
      console.error('Blockchain authorization error:', authError);
      institution.blockchainError = authError.message;
      await institution.save();
      
      res.status(500).json({ 
        error: 'Failed to authorize on blockchain',
        details: authError.message 
      });
    }
    
  } catch (error) {
    console.error('Blockchain authorization error:', error);
    res.status(500).json({ 
      error: 'Failed to authorize on blockchain',
      details: error.message 
    });
  }
});

// NEW: Check if institution is authorized on blockchain
app.get('/api/institutions/:institutionId/blockchain-status', authenticateToken, async (req, res) => {
  try {
    const { institutionId } = req.params;
    
    // Verify this is the same institution or admin
    if (req.user.institutionId !== institutionId && req.headers['admin-email'] !== 'admin@educhain.com') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const institution = await Institution.findById(institutionId);
    if (!institution) {
      return res.status(404).json({ error: 'Institution not found' });
    }
    
    // Check blockchain status
     const { blockchainService } = require('./lib/blockchain.js');
    
    try {
      const stats = await blockchainService.getInstitutionStats(institution.walletAddress);
      
      res.json({
        institution: {
          name: institution.name,
          email: institution.email,
          walletAddress: institution.walletAddress,
          backendVerified: institution.isVerified,
          blockchainRegistered: institution.blockchainRegistered
        },
        blockchainStats: stats,
        isAuthorizedOnChain: stats.isAuthorized
      });
      
    } catch (blockchainError) {
      res.json({
        institution: {
          name: institution.name,
          email: institution.email,
          walletAddress: institution.walletAddress,
          backendVerified: institution.isVerified,
          blockchainRegistered: institution.blockchainRegistered
        },
        blockchainStats: null,
        isAuthorizedOnChain: false,
        error: blockchainError.message
      });
    }
    
  } catch (error) {
    console.error('Blockchain status check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
// Admin: Manually verify institution (for testing)
app.post('/api/admin/verify-institution/:institutionId', isAdmin, async (req, res) => {
  try {
    const { institutionId } = req.params;
    const { status } = req.body;

    const institution = await Institution.findById(institutionId);
    if (!institution) {
      return res.status(404).json({
        error: 'Institution not found'
      });
    }

    institution.isVerified = status === 'approved';
    institution.verificationStatus = status;
    await institution.save();

    res.json({
      message: `Institution ${status}`,
      institution: {
        id: institution._id,
        name: institution.name,
        email: institution.email,
        isVerified: institution.isVerified,
        verificationStatus: institution.verificationStatus
      }
    });

  } catch (error) {
    console.error('Manual institution verification error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Certificate issuance endpoint (only for verified institutions)
app.post('/api/certificates/issue', authenticateToken, upload.single('certificateFile'), async (req, res) => {
  try {
    console.log('Certificate issuance request received');
    console.log('User:', req.user);
    console.log('Request body:', req.body);
    console.log('File:', req.file);
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) {
      console.log('Institution not found for ID:', req.user.institutionId);
      return res.status(404).json({ error: 'Institution not found' });
    }
    // Find the institution's active subscription
    const subscription = await Subscription.findOne({ institutionId: institution._id, status: 'active' });
    const planId = subscription?.planId;
    // Allow certificate issuance if institution is verified OR on active free trial
    if (!institution.isVerified && planId !== 'freetrial') {
      console.log('Institution not verified and not on free trial');
      return res.status(403).json({ error: 'Institution must be verified to issue certificates' });
    }
    // Check usage limits
    const usageCheck = await checkUsageLimits(institution._id);
    if (!usageCheck.allowed) {
      console.log('Usage limits exceeded:', usageCheck.reason);
      return res.status(403).json({ error: usageCheck.reason, upgradeRequired: true });
    }
    const {
      studentAddress,
      studentName,
      courseName,
      grade,
      completionDate,
      certificateType
    } = req.body;
    console.log('Extracted fields:', { studentAddress, studentName, courseName, grade, completionDate, certificateType });
    // Validate required fields from form data
    if (!studentAddress || !studentName || !courseName) {
      console.log('Missing required fields:', { studentAddress, studentName, courseName });
      return res.status(400).json({ error: 'Missing required fields: studentAddress, studentName, courseName' });
    }
    // Check for file
    if (!req.file) {
      console.log('No file uploaded');
      return res.status(400).json({ error: 'Certificate file is required.' });
    }
    console.log('Uploading to Pinata...');
    // Upload to Pinata
    const ipfsHash = await uploadToPinata(req.file.buffer, req.file.originalname);
    console.log('IPFS Hash:', ipfsHash);
    // Always set issuedAt to now
    const issuedAt = new Date();
    // Save certificate to MongoDB first
    const certificate = new Certificate({
      studentAddress,
      studentName,
      courseName,
      grade: grade || 'N/A',
      ipfsHash,
      completionDate: completionDate || issuedAt,
      certificateType: certificateType || 'Academic',
      issuedBy: institution._id,
      institutionName: institution.name,
      issuedAt,
      isValid: true,
      isMinted: false,
      mintedTo: ""
    });
    await certificate.save();
    console.log('Certificate created and saved to database:', certificate);

    // Now mint on blockchain if student address is provided
    let blockchainResult = null;
    if (studentAddress && studentAddress.trim() !== '') {
      try {
        console.log('Attempting to mint certificate on blockchain...');
        
        // Import blockchain service
        let blockchainService;
        try {
          const blockchainModule = await import('./lib/blockchain.js');
          blockchainService = blockchainModule.blockchainService;
        } catch (importError) {
          console.error('Blockchain service not available:', importError.message);
          throw new Error('Blockchain service not configured');
        }

        // Connect to blockchain
        await blockchainService.connectWallet();

        // Mint certificate on blockchain
        blockchainResult = await blockchainService.issueCertificate(
          studentAddress,
          studentName,
          courseName,
          grade || 'N/A',
          ipfsHash,
          completionDate ? new Date(completionDate).getTime() / 1000 : Math.floor(Date.now() / 1000),
          certificateType || 'Academic'
        );

        // Update certificate with blockchain data
        certificate.tokenId = blockchainResult.tokenId;
        certificate.isMinted = true;
        certificate.mintedTo = studentAddress;
        certificate.blockchainTxHash = blockchainResult.transactionHash;
        certificate.blockchainBlockNumber = blockchainResult.blockNumber;
        await certificate.save();

        console.log('Certificate successfully minted on blockchain:', blockchainResult);

      } catch (blockchainError) {
        console.error('Failed to mint certificate on blockchain:', blockchainError);
        
        // Certificate is still saved in database, but blockchain minting failed
        certificate.blockchainError = blockchainError.message;
        await certificate.save();
        
        // Continue with response, but indicate blockchain failure
        return res.json({
          message: 'Certificate issued successfully in database, but blockchain minting failed.',
          certificate,
          blockchainError: blockchainError.message,
          contractAddress: '0xBD4228241dc6BC14C027bF8B6A24f97bc9872068'
        });
      }
    }

    // Success response
    res.json({
      message: blockchainResult 
        ? 'Certificate issued and minted on blockchain successfully!' 
        : 'Certificate issued successfully in database (no student wallet for blockchain minting).',
      certificate,
      blockchainResult,
      contractAddress: '0xBD4228241dc6BC14C027bF8B6A24f97bc9872068'
    });
   } catch (error) {
     console.error('Certificate issuance error:', error);
     res.status(500).json({
       error: 'Internal server error during certificate issuance'
     });
   }
 });

// Endpoint to update certificate after on-chain mint (called from frontend after successful mint)
app.post('/api/certificates/:certificateId/onchain-mint', async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { tokenId, walletAddress } = req.body;
    if (!tokenId || !walletAddress) {
      return res.status(400).json({ error: 'tokenId and walletAddress are required' });
    }
    const certificate = await Certificate.findById(certificateId);
    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    // Only allow if wallet matches studentAddress
    if (!new RegExp(`^${certificate.studentAddress}$`, 'i').test(walletAddress)) {
      return res.status(403).json({ error: 'Wallet address does not match certificate student address' });
    }
    certificate.tokenId = tokenId;
    certificate.isMinted = true;
    certificate.mintedTo = walletAddress;
    certificate.mintedAt = new Date();
    await certificate.save();
    res.json({ message: 'Certificate updated after on-chain mint', certificate });
  } catch (error) {
    console.error('On-chain mint update error:', error);
    res.status(500).json({ error: 'Internal server error during on-chain mint update' });
  }
});
// Check usage limits before certificate issuance

// Get dashboard stats
app.get('/api/stats', authenticateToken, async (_req, res) => {
  try {
    // Mock stats - in production, calculate from actual data
    const stats = {
      totalCertificates: 156,
      activeCertificates: 142,
      revokedCertificates: 14,
      certificatesByType: [
        { _id: 'Bachelor Degree', count: 45 },
        { _id: 'Master Degree', count: 32 },
        { _id: 'Diploma', count: 28 },
        { _id: 'Certificate', count: 51 }
      ]
    };
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get institution certificates
app.get('/api/certificates/institution', authenticateToken, async (req, res) => {
  try {
    // Fetch certificates issued by this institution from MongoDB
    const institutionId = req.user.institutionId;
    const certificates = await Certificate.find({ issuedBy: institutionId });
    res.json({ certificates });
  } catch (error) {
    console.error('Certificates error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Certificate API routes (MongoDB)
// Get certificates by wallet address (student)
app.get('/api/certificates/wallet/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address is required' });
    }
    
    console.log(`Fetching certificates for wallet: ${walletAddress}`);
    
    const certs = await Certificate.find({ 
      studentAddress: new RegExp(`^${walletAddress}$`, 'i') 
    }).populate('issuedBy', 'name email');
    
    console.log(`Found ${certs.length} certificates for wallet ${walletAddress}`);
    
    // Format certificates for frontend
    const formattedCerts = certs.map(cert => ({
      id: cert._id,
      studentAddress: cert.studentAddress,
      studentName: cert.studentName,
      courseName: cert.courseName,
      grade: cert.grade,
      ipfsHash: cert.ipfsHash,
      completionDate: cert.completionDate,
      certificateType: cert.certificateType,
      issuedBy: cert.issuedBy,
      institutionName: cert.institutionName,
      issuedAt: cert.issuedAt,
      isValid: cert.isValid,
      isMinted: cert.isMinted,
      tokenId: cert.tokenId,
      mintedTo: cert.mintedTo,
      mintedAt: cert.mintedAt,
      // Add verification URLs
      verificationUrls: {
        byId: `/api/certificates/verify/${cert._id}`,
        byIPFS: `/api/certificates/verify/ipfs/${cert.ipfsHash}`,
        byToken: cert.tokenId ? `/api/certificates/verify/token/${cert.tokenId}` : null
      }
    }));
    
    res.json({ 
      certificates: formattedCerts,
      total: formattedCerts.length,
      walletAddress: walletAddress
    });
  } catch (err) {
    console.error('Error fetching certificates by wallet:', err);
    res.status(500).json({ error: err.message });
  }
});
// Verify certificate by ID or tokenId (and show contract address)
app.get('/api/certificates/verify/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let cert = null;
    let blockchainVerification = null;
    
    // Try to find by ObjectId
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      cert = await Certificate.findById(id);
    }
    // If not found, try to find by tokenId (number)
    if (!cert && /^\d+$/.test(id)) {
      cert = await Certificate.findOne({ tokenId: parseInt(id, 10) });
    }
    
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    // If certificate is minted, verify on blockchain
    if (cert.isMinted && cert.tokenId) {
      try {
        const blockchainModule = await import('./lib/blockchain.js');
        const blockchainService = blockchainModule.blockchainService;
        
        blockchainVerification = await blockchainService.verifyCertificate(cert.tokenId);
        
        // Check if blockchain verification matches database
        if (blockchainVerification.exists) {
          const blockchainCert = blockchainVerification.certificate;
          const isValidOnChain = blockchainCert.isValid;
          
          // Update database if blockchain shows different validity
          if (cert.isValid !== isValidOnChain) {
            cert.isValid = isValidOnChain;
            await cert.save();
          }
        }
      } catch (blockchainError) {
        console.error('Blockchain verification failed:', blockchainError);
        blockchainVerification = { error: blockchainError.message };
      }
    }

    res.json({ 
      valid: true, 
      certificate: cert, 
      blockchainVerification,
      contractAddress: '0xBD4228241dc6BC14C027bF8B6A24f97bc9872068',
      verificationMethod: cert.isMinted ? 'database_and_blockchain' : 'database_only'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify certificate by IPFS hash
app.get('/api/certificates/verify/ipfs/:ipfsHash', async (req, res) => {
  try {
    const { ipfsHash } = req.params;
    
    if (!ipfsHash) {
      return res.status(400).json({ error: 'IPFS hash is required' });
    }
    
    const cert = await Certificate.findOne({ ipfsHash: ipfsHash });
    let blockchainVerification = null;
    
    if (!cert) {
      return res.status(404).json({ 
        error: 'Certificate not found for this IPFS hash',
        ipfsHash: ipfsHash
      });
    }

    // Always try to verify on blockchain by IPFS hash
    try {
      const blockchainModule = await import('./lib/blockchain.js');
      const blockchainService = blockchainModule.blockchainService;
      
      blockchainVerification = await blockchainService.verifyCertificateByIPFS(ipfsHash);
      
      // If found on blockchain but not in database, or vice versa
      if (blockchainVerification.exists && !cert.isMinted) {
        // Certificate exists on blockchain but not marked as minted in database
        cert.isMinted = true;
        cert.tokenId = blockchainVerification.tokenId;
        cert.mintedTo = cert.studentAddress;
        await cert.save();
      }
      
      // Update validity based on blockchain
      if (blockchainVerification.exists) {
        const blockchainCert = blockchainVerification.certificate;
        if (cert.isValid !== blockchainCert.isValid) {
          cert.isValid = blockchainCert.isValid;
          await cert.save();
        }
      }
    } catch (blockchainError) {
      console.error('Blockchain verification failed:', blockchainError);
      blockchainVerification = { error: blockchainError.message };
    }
    
    res.json({ 
      valid: true, 
      certificate: cert, 
      blockchainVerification,
      contractAddress: '0xBD4228241dc6BC14C027bF8B6A24f97bc9872068',
      verificationMethod: 'ipfs_hash_and_blockchain'
    });
  } catch (err) {
    console.error('IPFS verification error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Verify certificate by token ID
app.get('/api/certificates/verify/token/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    
    if (!tokenId || isNaN(parseInt(tokenId))) {
      return res.status(400).json({ error: 'Valid token ID is required' });
    }
    
    const cert = await Certificate.findOne({ tokenId: parseInt(tokenId, 10) });
    let blockchainVerification = null;
    
    if (!cert) {
      return res.status(404).json({ 
        error: 'Certificate not found for this token ID',
        tokenId: tokenId
      });
    }

    // Always verify on blockchain by token ID
    try {
      const blockchainModule = await import('./lib/blockchain.js');
      const blockchainService = blockchainModule.blockchainService;
      
      blockchainVerification = await blockchainService.verifyCertificate(parseInt(tokenId, 10));
      
      // Update validity based on blockchain
      if (blockchainVerification.exists) {
        const blockchainCert = blockchainVerification.certificate;
        if (cert.isValid !== blockchainCert.isValid) {
          cert.isValid = blockchainCert.isValid;
          await cert.save();
        }
      }
    } catch (blockchainError) {
      console.error('Blockchain verification failed:', blockchainError);
      blockchainVerification = { error: blockchainError.message };
    }
    
    res.json({ 
      valid: true, 
      certificate: cert, 
      blockchainVerification,
      contractAddress: '0xBD4228241dc6BC14C027bF8B6A24f97bc9872068',
      verificationMethod: 'token_id_and_blockchain'
    });
  } catch (err) {
    console.error('Token verification error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get certificate by tokenId
app.get('/api/certificates/token/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;
    const cert = await Certificate.findOne({ tokenId: parseInt(tokenId, 10) });
    if (!cert) {
      return res.status(404).json({ error: 'Certificate not found for this tokenId' });
    }
    res.json({ certificate: cert });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Revoke certificate (admin only)
app.post('/api/certificates/:certificateId/revoke', authenticateToken, async (req, res) => {
  try {
    const { certificateId } = req.params;
    
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const certificate = await Certificate.findById(certificateId);
    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }
    
    // Update database
    certificate.isValid = false;
    certificate.revokedAt = new Date();
    certificate.revokedBy = req.user.id;
    await certificate.save();
    
    // Revoke on blockchain if minted
    let blockchainResult = null;
    if (certificate.isMinted && certificate.tokenId) {
      try {
        const blockchainModule = await import('./lib/blockchain.js');
        const blockchainService = blockchainModule.blockchainService;
        
        await blockchainService.connectWallet();
        blockchainResult = await blockchainService.revokeCertificate(certificate.tokenId);
        
        // Update certificate with blockchain revocation info
        certificate.blockchainRevokeTxHash = blockchainResult.transactionHash;
        certificate.blockchainRevokeBlockNumber = blockchainResult.blockNumber;
        await certificate.save();
        
      } catch (blockchainError) {
        console.error('Failed to revoke certificate on blockchain:', blockchainError);
        certificate.blockchainRevokeError = blockchainError.message;
        await certificate.save();
      }
    }
    
    res.json({
      message: 'Certificate revoked successfully',
      certificate,
      blockchainResult
    });
    
  } catch (error) {
    console.error('Certificate revocation error:', error);
    res.status(500).json({ error: 'Failed to revoke certificate' });
  }
});
app.post('/api/certificates', async (req, res) => {
  try {
    const cert = new Certificate(req.body);
    await cert.save();
    res.status(201).json(cert);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/certificates', async (_req, res) => {
  try {
    const certs = await Certificate.find();
    res.json(certs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get subscription plans
app.get('/api/subscription/plans', (_req, res) => {
  try {
    res.json({
      plans: SUBSCRIPTION_PLANS,
      currentPlan: null // Will be populated if user is authenticated
    });
  } catch (error) {
    console.error('Get subscription plans error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get user's current subscription
app.get('/api/subscription/current', authenticateToken, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId);
    
    if (!institution) {
      return res.status(404).json({
        error: 'Institution not found'
      });
    }

    const subscription = await Subscription.findOne({ institutionId: institution._id });
    
    res.json({
      subscription: subscription || null,
      usage: {
        certificatesThisMonth: 45, // Mock data
        storageUsed: 0.5, // GB
        apiCallsThisMonth: 234
      }
    });
  } catch (error) {
    console.error('Get current subscription error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Add usage endpoint
app.get('/api/subscription/usage', authenticateToken, async (req, res) => {
  try {
    // Find the institution's active subscription
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) {
      return res.status(404).json({ error: 'Institution not found' });
    }
    const subscription = await Subscription.findOne({ institutionId: institution._id, status: 'active' });
    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }
    const planId = subscription.planId;
    const plan = SUBSCRIPTION_PLANS[planId];
    if (!plan) {
      return res.status(400).json({ error: 'Invalid plan ID for snubscription' });
    }
    // Mock usage data (replace with real usage if available)
    res.json({
      certificatesIssued: 0,
      certificatesLimit: plan.limits.certificatesPerMonth,
      planId,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd
    });
  } catch (error) {
    console.error('Usage endpoint error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Improve error logging and free trial handling in subscribe endpoint
app.post('/api/subscription/subscribe', authenticateToken, async (req, res) => {
  try {
    const { planId, paymentMethod } = req.body;
    if (!SUBSCRIPTION_PLANS[planId]) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) {
      return res.status(404).json({ error: 'Institution not found' });
    }
    // Create payment record in MongoDB
    const payment = new Payment({
      institutionId: institution._id,
      planId,
      amount: SUBSCRIPTION_PLANS[planId].price,
      currency: SUBSCRIPTION_PLANS[planId].currency,
      status: 'completed',
      paymentMethod,
      createdAt: new Date()
    });
    await payment.save();
    // Create or update subscription
    let subscription = await Subscription.findOne({ institutionId: institution._id });
    if (subscription) {
      subscription.planId = planId;
      subscription.status = 'active';
      subscription.currentPeriodEnd = new Date(Date.now() + 30*24*60*60*1000).toISOString();
      await subscription.save();
    } else {
      subscription = new Subscription({
        institutionId: institution._id,
        planId,
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30*24*60*60*1000).toISOString()
      });
      await subscription.save();
    }
    res.json({ message: 'Subscription successful', subscription, payment });
  } catch (error) {
    console.error('Subscribe endpoint error:', error);
    res.status(500).json({ error: 'Internal server error during subscription' });
  }
});

// Cancel subscription
app.post('/api/subscription/cancel', authenticateToken, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId);
    
    if (!institution) {
      return res.status(404).json({
        error: 'Institution not found'
      });
    }

    const subscription = await Subscription.findOne({ institutionId: institution._id });
    
    if (!subscription) {
      return res.status(404).json({
        error: 'No active subscription found'
      });
    }

    subscription.status = 'cancelled';
    subscription.cancelledAt = new Date().toISOString();
    await subscription.save();

    res.json({
      message: 'Subscription cancelled successfully',
      subscription
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// Get payment history
app.get('/api/subscription/payments', authenticateToken, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution) {
      return res.status(404).json({
        error: 'Institution not found'
      });
    }
    const userPayments = await Payment.find({ institutionId: institution._id });
    res.json({ payments: userPayments });
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get revenue analytics
app.get('/api/admin/revenue', isAdmin, async (_req, res) => {
  try {
    const payments = await Payment.find({ status: 'completed' });
    const totalRevenue = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const monthlyRevenue = payments.filter(payment => {
      const paymentDate = new Date(payment.createdAt);
      const currentDate = new Date();
      return paymentDate.getMonth() === currentDate.getMonth() && paymentDate.getFullYear() === currentDate.getFullYear();
    }).reduce((sum, payment) => sum + payment.amount, 0);
    const planDistribution = {};
    payments.forEach(payment => {
      planDistribution[payment.planId] = (planDistribution[payment.planId] || 0) + 1;
    });
    res.json({
      totalRevenue,
      monthlyRevenue,
      planDistribution,
      totalSubscriptions: await Subscription.countDocuments({ status: 'active' }),
      totalInstitutions: await Institution.countDocuments()
    });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get all institutions and their verification requests
app.get('/api/admin/verification-requests', isAdmin, async (_req, res) => {
  try {
    // Get all institutions
    const institutions = await Institution.find().select('name email registrationNumber verificationStatus isVerified verificationDocuments');
    // Get all verification requests
    const verificationRequests = await VerificationRequest.find();

    // Merge info: for each institution, find its verification request (if any)
    const formatDocumentUrl = (url) => {
      // If already a gateway URL, return as is
      if (url.startsWith('http://') || url.startsWith('https://')) return url;
      // Otherwise, treat as IPFS hash
      return `https://gateway.pinata.cloud/ipfs/${url}`;
    };

    const merged = institutions.map(inst => {
      const req = verificationRequests.find(r => r.institutionId.toString() === inst._id.toString());
      // Use documents from verification request if available, else from institution
      const docs = req ? req.documents : inst.verificationDocuments || [];
      // Format document URLs for browser viewing
      const formattedDocs = docs.map(doc => ({
        ...doc,
        url: doc.url ? formatDocumentUrl(doc.url) : ''
      }));
      return {
        id: inst._id,
        institutionName: inst.name,
        institutionEmail: inst.email,
        registrationNumber: inst.registrationNumber,
        status: inst.verificationStatus || (req ? req.status : 'not_submitted'),
        isVerified: inst.isVerified,
        documents: formattedDocs,
        verificationRequestId: req ? req._id : null,
        submittedAt: req ? req.submittedAt : null,
        reviewedAt: req ? req.reviewedAt : null,
        reviewedBy: req ? req.reviewedBy : null,
        comments: req ? req.comments : null
      };
    });

    res.json({ verificationRequests: merged });
  } catch (error) {
    console.error('Get verification requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public endpoints (no authentication required)

// Student: Mint certificate to wallet (no JWT required, wallet connects directly)
app.post('/api/certificates/:certificateId/mint', async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { walletAddress } = req.body;
    // Find certificate
    const certificate = await Certificate.findById(certificateId);
    if (!certificate) {
      console.error('Mint error: Certificate not found for ID', certificateId);
      return res.status(404).json({ error: 'Certificate not found' });
    }
    if (certificate.isMinted) {
      console.error('Mint error: Certificate already minted for ID', certificateId);
      return res.status(400).json({ error: 'Certificate already minted' });
    }
    if (!walletAddress || typeof walletAddress !== 'string') {
      console.error('Mint error: Invalid wallet address', walletAddress);
      return res.status(400).json({ error: 'Invalid wallet address' });
    }
    // Only allow minting if walletAddress matches certificate.studentAddress (case-insensitive)
    if (!new RegExp(`^${certificate.studentAddress}$`, 'i').test(walletAddress)) {
      console.error('Mint error: Wallet address does not match certificate student address', walletAddress);
      return res.status(403).json({ error: 'Wallet address does not match certificate student address' });
    }
    // Here you would interact with your smart contract to mint NFT
    // For now, just update status
    certificate.isMinted = true;
    certificate.mintedTo = walletAddress;
    certificate.mintedAt = new Date();
    await certificate.save();
    console.log('Mint success: Certificate minted to', walletAddress, 'for ID', certificateId);
    res.json({ message: 'Certificate minted successfully', certificate });
  } catch (error) {
    console.error('Mint certificate error:', error);
    res.status(500).json({ error: 'Internal server error during minting' });
  }
});
// NEW: Get blockchain integration summary
app.get('/api/admin/blockchain-summary', isAdmin, async (req, res) => {
  try {
    const totalInstitutions = await Institution.countDocuments();
    const verifiedInstitutions = await Institution.countDocuments({ isVerified: true });
    const blockchainRegistered = await Institution.countDocuments({ blockchainRegistered: true });
    const blockchainAuthorized = await Institution.countDocuments({ blockchainAuthorized: true });
    const pendingBlockchainRegistration = verifiedInstitutions - blockchainRegistered;
    const pendingBlockchainAuthorization = blockchainRegistered - blockchainAuthorized;
    
    res.json({
      summary: {
        totalInstitutions,
        verifiedInstitutions,
        blockchainRegistered,
        blockchainAuthorized,
        pendingBlockchainRegistration,
        pendingBlockchainAuthorization
      },
      status: 'OK'
    });
  } catch (error) {
    console.error('Blockchain summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Root route handler
app.get('/', (_req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'EduChain API is running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      institutions: '/api/institutions',
      certificates: '/api/certificates',
      subscription: '/api/subscription'
    }
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'EduChain API is running',
    timestamp: new Date().toISOString(),
    endpoints: {
      certificates: '/api/certificates',
      verification: '/api/certificates/verify',
      admin: '/api/admin',
      health: '/api/health'
    }
  });
});

// Global error handler to catch any unhandled errors
app.use((err, req, res, next) => {
  console.error('Global error handler caught:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  console.log('404 - Route not found:', req.originalUrl);
  res.status(404).json({ error: 'Route not found' });
});

// Serve static files from React build (for production)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
  
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`EduChain API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log('CORS origins allowed:', [
    'http://localhost:5000',
    'http://localhost:3000',
    'https://educhain-frontend.vercel.app',
    'https://educhain-frontend-git-main.vercel.app',
    process.env.FRONTEND_URL
  ].filter(Boolean));
});
