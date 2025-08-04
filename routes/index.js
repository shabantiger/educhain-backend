const express = require('express');
const authRoutes = require('./auth');
const institutionRoutes = require('./institutions');
const certificateRoutes = require('./certificates');

const router = express.Router();

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    // Check database connection
    const mongoose = require('mongoose');
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Check IPFS connection
    let ipfsStatus = 'disconnected';
    try {
      const pinata = require('@pinata/sdk')(process.env.PINATA_API_KEY, process.env.PINATA_SECRET_KEY);
      await pinata.testAuthentication();
      ipfsStatus = 'connected';
    } catch (error) {
      console.error('IPFS connection error:', error);
    }

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: dbStatus,
        ipfs: ipfsStatus,
        api: 'running'
      },
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Mount route modules
router.use('/auth', authRoutes);
router.use('/institutions', institutionRoutes);
router.use('/certificates', certificateRoutes);

// 404 handler for API routes
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found'
  });
});

module.exports = router;// models/Institution.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const InstitutionSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Institution name is required'],
    trim: true,
    maxlength: [200, 'Institution name cannot exceed 200 characters']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters']
  }});
  