const express = require('express');
const { Institution } = require('../models');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Get all institutions (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, verified } = req.query;
    
    let query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { registrationNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (verified !== undefined) {
      query.isVerified = verified === 'true';
    }

    const institutions = await Institution.find(query)
      .select('-password')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await Institution.countDocuments(query);

    res.json({
      success: true,
      institutions,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Institutions fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch institutions'
    });
  }
});

// Verify institution (admin only)
router.put('/:id/verify', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const institution = await Institution.findByIdAndUpdate(
      req.params.id,
      { isVerified: true },
      { new: true }
    ).select('-password');

    if (!institution) {
      return res.status(404).json({
        success: false,
        error: 'Institution not found'
      });
    }

    res.json({
      success: true,
      message: 'Institution verified successfully',
      institution
    });
  } catch (error) {
    console.error('Institution verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify institution'
    });
  }
});

// Unverify institution (admin only)
router.put('/:id/unverify', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const institution = await Institution.findByIdAndUpdate(
      req.params.id,
      { isVerified: false },
      { new: true }
    ).select('-password');

    if (!institution) {
      return res.status(404).json({
        success: false,
        error: 'Institution not found'
      });
    }

    res.json({
      success: true,
      message: 'Institution verification removed',
      institution
    });
  } catch (error) {
    console.error('Institution unverification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to unverify institution'
    });
  }
});

// Get institution statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await Institution.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          verified: { $sum: { $cond: ['$isVerified', 1, 0] } },
          unverified: { $sum: { $cond: ['$isVerified', 0, 1] } }
        }
      }
    ]);

    res.json({
      success: true,
      stats: stats[0] || { total: 0, verified: 0, unverified: 0 }
    });
  } catch (error) {
    console.error('Institution stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

module.exports = router;
