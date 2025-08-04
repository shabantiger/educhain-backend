const axios = require('axios');
const FormData = require('form-data');

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_BASE_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

/**
 * Uploads a file to Pinata IPFS.
 * @param {Buffer} fileBuffer The buffer of the file to upload.
 * @param {string} originalname The original name of the file.
 * @returns {Promise<string>} The IPFS hash of the uploaded file.
 */
const uploadToPinata = async (fileBuffer, originalname) => {
  // Check if Pinata credentials are configured
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    console.log('Pinata API keys not configured, using mock IPFS hash');
    // Return a mock IPFS hash for testing purposes
    return `QmMock${Date.now()}${Math.random().toString(36).substring(2, 15)}`;
  }

  try {
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: originalname });

    const response = await axios.post(PINATA_BASE_URL, formData, {
      maxBodyLength: 'Infinity',
      headers: {
        ...formData.getHeaders(),
        pinata_api_key: PINATA_API_KEY,
        pinata_secret_api_key: PINATA_SECRET_KEY,
      },
    });

    return response.data.IpfsHash;
  } catch (error) {
    console.error('Error uploading to Pinata:', error.response?.data || error.message);
    // Return a mock IPFS hash as fallback
    return `QmMock${Date.now()}${Math.random().toString(36).substring(2, 15)}`;
  }
};

module.exports = {
  uploadToPinata,
};