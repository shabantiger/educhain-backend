const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { Institution } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { validateRegistration, validateLogin } = require('../middleware/validation');

const router = express.Router();

// Rate limiting for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts, please try again later'
});

// Register institution
router.post('/register', authLimiter, validateRegistration, async (req, res) => {
  try {
    const { name, email, password, walletAddress, registrationNumber, contactInfo } = req.body;

    // Check if institution already exists
    const existingInstitution = await Institution.findOne({
      $or: [
        { email: email.toLowerCase() },
        { walletAddress: walletAddress.toLowerCase() },
        { registrationNumber }
      ]
    });

    if (existingInstitution) {
      return res.status(400).json({
        success: false,
        error: 'Institution with this email, wallet address, or registration number already exists'
      });
    }

    // Create new institution
    const institution = new Institution({
      name,
      email: email.toLowerCase(),
      password,
      walletAddress: walletAddress.toLowerCase(),
      registrationNumber,
      contactInfo
    });

    await institution.save();

    res.status(201).json({
      success: true,
      message: 'Institution registered successfully',
      data: {
        institutionId: institution._id,
        name: institution.name,
        email: institution.email,
        walletAddress: institution.walletAddress,
        isVerified: institution.isVerified
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// Login institution
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find institution
    const institution = await Institution.findOne({ email: email.toLowerCase() });
    if (!institution) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await institution.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        institutionId: institution._id,
        walletAddress: institution.walletAddress,
        name: institution.name,
        isVerified: institution.isVerified
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      institution: {
        id: institution._id,
        name: institution.name,
        email: institution.email,
        walletAddress: institution.walletAddress,
        isVerified: institution.isVerified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Get current institution profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId).select('-password');
    
    if (!institution) {
      return res.status(404).json({
        success: false,
        error: 'Institution not found'
      });
    }

    res.json({
      success: true,
      institution
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile'
    });
  }
});

// Update institution profile
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { name, contactInfo } = req.body;
    
    const institution = await Institution.findByIdAndUpdate(
      req.user.institutionId,
      { name, contactInfo },
      { new: true, runValidators: true }
    ).select('-password');

    res.json({
      success: true,
      institution
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// Refresh token
router.post('/refresh', authenticateToken, async (req, res) => {
  try {
    const institution = await Institution.findById(req.user.institutionId);
    
    if (!institution) {
      return res.status(404).json({
        success: false,
        error: 'Institution not found'
      });
    }

    const token = jwt.sign(
      {
        institutionId: institution._id,
        walletAddress: institution.walletAddress,
        name: institution.name,
        isVerified: institution.isVerified
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token'
    });
  }
});

module.exports = router;
