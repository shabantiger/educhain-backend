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
app.use(cors());
app.use(express.json());

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// In-memory storage for institutions (in production, use a database)
// const verificationRequests = []; // Removed unused variable
// const subscriptions = []; // Removed unused variable

// Replace the old SUBSCRIPTION_PLANS with the import from pricing config
import PRICING_CONFIG from './config/pricing.js';
let SUBSCRIPTION_PLANS;
try {
  SUBSCRIPTION_PLANS = PRICING_CONFIG.plans;
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

// Middleware to check if user is admin (for verification purposes)
const isAdmin = (req, res, next) => {
  // In production, implement proper admin authentication
  const adminEmail = req.headers['admin-email'];
  if (adminEmail === 'admin@educhain.com') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
  }
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

// Admin: Approve/Reject verification request
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
    } else {
      institution.isVerified = false;
    }
    await institution.save();

    res.json({
      message: `Verification request ${status}`,
      institution
    });

  } catch (error) {
    console.error('Review verification request error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
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
    // Save certificate to MongoDB WITHOUT tokenId (wait for on-chain mint)
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
    console.log('Certificate created and saved (pre-mint):', certificate);
    res.json({
      message: 'Certificate issued successfully. Please mint on-chain from frontend.',
      certificate,
      contractAddress: '0xBD4228241dc6BC14C027bF8B6A24f97bc9872068'
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
  } catch (error) {
    console.error('Certificate issuance error:', error);
    res.status(500).json({
      error: 'Internal server error during certificate issuance'
    });
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
    const certs = await Certificate.find({ studentAddress: new RegExp(`^${walletAddress}$`, 'i') });
    res.json({ certificates: certs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Verify certificate by ID or tokenId (and show contract address)
app.get('/api/certificates/verify/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let cert = null;
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
    res.json({ valid: true, certificate: cert, contractAddress: '0xd2a44c2f0b05fc3b3b348083ad7f542bbad8a226' });
  } catch (err) {
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
// Get certificates by wallet address (student)
app.get('/api/certificates/wallet/:walletAddress', async (req, res) => {
  try {
    const { walletAddress } = req.params;
    const certs = await Certificate.find({ studentAddress: new RegExp(`^${walletAddress}$`, 'i') });
    res.json({ certificates: certs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
app.get('/api/health', (_req, res) => {
  res.json({ status: 'OK', message: 'EduChain API is running' });
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
});
