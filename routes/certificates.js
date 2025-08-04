const express = require('express');
const multer = require('multer');
const { Certificate, Institution } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { validateCertificateUpload, validateCertificateIssue } = require('../middleware/validation');
const { uploadToIPFS, generateCertificateMetadata } = require('../utils/ipfs');
const { issueCertificateOnChain, verifyCertificateOnChain } = require('../utils/blockchain');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only images and PDFs are allowed'));
    }
  }
});

// Upload certificate to IPFS
router.post('/upload', authenticateToken, upload.single('certificate'), validateCertificateUpload, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Certificate file is required'
      });
    }

    const { studentName, studentId, studentEmail, courseName, grade, certificateType, graduationDate } = req.body;

    // Get institution details
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution || !institution.isVerified) {
      return res.status(403).json({
        success: false,
        error: 'Institution must be verified to issue certificates'
      });
    }

    // Upload file to IPFS
    const fileResult = await uploadToIPFS(req.file.buffer, {
      name: `certificate-${studentId}-${Date.now()}`,
      keyvalues: {
        studentId,
        courseName,
        institution: institution.name
      }
    });

    // Generate metadata
    const certificateData = {
      studentName,
      studentId,
      studentEmail,
      courseName,
      grade,
      certificateType,
      institutionName: institution.name,
      issueDate: new Date(),
      graduationDate: new Date(graduationDate),
      imageUrl: `https://gateway.pinata.cloud/ipfs/${fileResult.IpfsHash}`
    };

    const metadata = generateCertificateMetadata(certificateData);
    const metadataResult = await uploadToIPFS(Buffer.from(JSON.stringify(metadata)), {
      name: `metadata-${studentId}-${Date.now()}`
    });

    res.json({
      success: true,
      ipfsHash: metadataResult.IpfsHash,
      fileHash: fileResult.IpfsHash,
      metadata,
      certificateData
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload certificate'
    });
  }
});

// Issue certificate on blockchain
router.post('/issue', authenticateToken, validateCertificateIssue, async (req, res) => {
  try {
    const {
      studentWalletAddress,
      studentName,
      studentId,
      studentEmail,
      courseName,
      grade,
      certificateType,
      graduationDate,
      ipfsHash
    } = req.body;

    // Get institution details
    const institution = await Institution.findById(req.user.institutionId);
    if (!institution || !institution.isVerified) {
      return res.status(403).json({
        success: false,
        error: 'Institution not verified'
      });
    }

    // Check for duplicate certificate
    const existingCertificate = await Certificate.findOne({
      studentId,
      courseName,
      institutionId: institution._id
    });

    if (existingCertificate) {
      return res.status(400).json({
        success: false,
        error: 'Certificate already exists for this student and course'
      });
    }

    // Issue certificate on blockchain
    const blockchainResult = await issueCertificateOnChain({
      studentWalletAddress,
      studentName,
      studentId,
      courseName,
      grade,
      certificateType,
      graduationDate,
      ipfsHash,
      institutionWallet: institution.walletAddress
    });

    // Save certificate to database
    const certificate = new Certificate({
      tokenId: blockchainResult.tokenId,
      studentName,
      studentId,
      studentEmail,
      courseName,
      grade,
      certificateType,
      institutionId: institution._id,
      ipfsHash,
      transactionHash: blockchainResult.transactionHash,
      issueDate: new Date(),
      graduationDate: new Date(graduationDate)
    });

    await certificate.save();

    res.json({
      success: true,
      tokenId: blockchainResult.tokenId,
      transactionHash: blockchainResult.transactionHash,
      message: 'Certificate issued successfully'
    });

  } catch (error) {
    console.error('Certificate issuance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to issue certificate'
    });
  }
});

// Verify certificate
router.get('/verify/:tokenId', async (req, res) => {
  try {
    const { tokenId } = req.params;

    // Verify on blockchain
    const blockchainResult = await verifyCertificateOnChain(tokenId);

    if (!blockchainResult.exists) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found'
      });
    }

    // Get additional details from database
    const dbCertificate = await Certificate.findOne({ tokenId }).populate('institutionId', 'name');

    const certificateData = {
      exists: blockchainResult.exists,
      isRevoked: blockchainResult.isRevoked,
      studentName: blockchainResult.studentName,
      courseName: blockchainResult.courseName,
      institutionName: blockchainResult.institutionName,
      issueDate: new Date(blockchainResult.issueDate * 1000),
      graduationDate: new Date(blockchainResult.graduationDate * 1000),
      grade: blockchainResult.grade,
      tokenId: parseInt(tokenId),
      additionalInfo: dbCertificate ? {
        certificateType: dbCertificate.certificateType,
        transactionHash: dbCertificate.transactionHash,
        ipfsHash: dbCertificate.ipfsHash,
        studentEmail: dbCertificate.studentEmail
      } : null
    };

    res.json({
      success: true,
      certificate: certificateData
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify certificate'
    });
  }
});

// Get certificates by student ID
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const certificates = await Certificate.find({ studentId })
      .populate('institutionId', 'name')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      certificates
    });
  } catch (error) {
    console.error('Error fetching student certificates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch certificates'
    });
  }
});

// Get certificates by institution
router.get('/institution', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, search, type, status } = req.query;

    let query = { institutionId: req.user.institutionId };

    if (search) {
      query.$or = [
        { studentName: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
        { courseName: { $regex: search, $options: 'i' } },
        { tokenId: isNaN(search) ? -1 : parseInt(search) }
      ];
    }

    if (type) {
      query.certificateType = type;
    }

    if (status) {
      query.isRevoked = status === 'revoked';
    }

    const certificates = await Certificate.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Certificate.countDocuments(query);

    res.json({
      success: true,
      certificates,
      pagination: {
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Error fetching institution certificates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch certificates'
    });
  }
});

// Revoke certificate
router.post('/:tokenId/revoke', authenticateToken, async (req, res) => {
  try {
    const { tokenId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Revocation reason is required'
      });
    }

    // Check if certificate belongs to this institution
    const certificate = await Certificate.findOne({
      tokenId: parseInt(tokenId),
      institutionId: req.user.institutionId
    });

    if (!certificate) {
      return res.status(404).json({
        success: false,
        error: 'Certificate not found or not authorized'
      });
    }

    if (certificate.isRevoked) {
      return res.status(400).json({
        success: false,
        error: 'Certificate already revoked'
      });
    }

    // Revoke on blockchain (implementation depends on smart contract)
    // const tx = await revokeCertificateOnChain(tokenId, reason);

    // Update database
    certificate.isRevoked = true;
    certificate.revokeReason = reason;
    certificate.revokeDate = new Date();
    await certificate.save();

    res.json({
      success: true,
      message: 'Certificate revoked successfully'
    });
  } catch (error) {
    console.error('Revocation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke certificate'
    });
  }
});

// Get certificate metadata from IPFS
router.get('/metadata/:ipfsHash', async (req, res) => {
  try {
    const { ipfsHash } = req.params;

    const response = await fetch(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`);

    if (!response.ok) {
      return res.status(404).json({
        success: false,
        error: 'Metadata not found'
      });
    }

    const metadata = await response.json();

    res.json({
      success: true,
      metadata
    });
  } catch (error) {
    console.error('Metadata fetch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch metadata'
    });
  }
});

// Search certificates
router.get('/search', async (req, res) => {
  try {
    const { query, type, limit = 50 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    let searchCriteria = {};

    switch (type) {
      case 'student':
        searchCriteria = {
          $or: [
            { studentName: { $regex: query, $options: 'i' } },
            { studentId: { $regex: query, $options: 'i' } },
            { studentEmail: { $regex: query, $options: 'i' } }
          ]
        };
        break;
      case 'course':
        searchCriteria = { courseName: { $regex: query, $options: 'i' } };
        break;
      case 'tokenId':
        searchCriteria = { tokenId: parseInt(query) };
        break;
      default:
        searchCriteria = {
          $or: [
            { studentName: { $regex: query, $options: 'i' } },
            { studentId: { $regex: query, $options: 'i' } },
            { courseName: { $regex: query, $options: 'i' } },
            { tokenId: isNaN(query) ? -1 : parseInt(query) }
          ]
        };
    }

    const certificates = await Certificate.find(searchCriteria)
      .populate('institutionId', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      certificates
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Search failed'
    });
  }
});

// Get statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;

    const stats = await Promise.all([
      Certificate.countDocuments({ institutionId }),
      Certificate.countDocuments({ institutionId, isRevoked: false }),
      Certificate.countDocuments({ institutionId, isRevoked: true }),
      Certificate.aggregate([
        { $match: { institutionId: new mongoose.Types.ObjectId(institutionId) } },
        { $group: { _id: '$certificateType', count: { $sum: 1 } } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalCertificates: stats[0],
        activeCertificates: stats[1],
        revokedCertificates: stats[2],
        certificatesByType: stats[3]
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch statistics'
    });
  }
});

module.exports = router;
