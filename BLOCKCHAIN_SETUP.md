# EduChain Backend Blockchain Setup Guide

## Base Mainnet Integration

Your backend is now configured to interact with the EduChain smart contract deployed on Base mainnet.

## Environment Variables Required

Add these to your `.env` file:

```env
# Blockchain Configuration
CONTRACT_ADDRESS=0xBD4228241dc6BC14C027bF8B6A24f97bc9872068
BASE_MAINNET_RPC_URL=https://mainnet.base.org
BLOCKCHAIN_PRIVATE_KEY=your_private_key_here

# Optional: Use a different RPC provider
# BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
# BASE_MAINNET_RPC_URL=https://base-mainnet.publicnode.com
```

## What's Now Integrated

### 1. Certificate Issuance
- ✅ **Automatic Blockchain Minting**: When a certificate is issued with a student wallet address, it's automatically minted on Base mainnet
- ✅ **Transaction Recording**: All blockchain transactions are recorded in the database
- ✅ **Error Handling**: If blockchain minting fails, the certificate is still saved in the database

### 2. Certificate Verification
- ✅ **Dual Verification**: Checks both database and blockchain
- ✅ **IPFS Verification**: Verifies certificates by IPFS hash on blockchain
- ✅ **Token ID Verification**: Verifies certificates by token ID on blockchain
- ✅ **Automatic Sync**: Updates database validity based on blockchain state

### 3. Certificate Revocation
- ✅ **Admin Revocation**: Admins can revoke certificates (both database and blockchain)
- ✅ **Blockchain Sync**: Revocation is recorded on Base mainnet
- ✅ **Transaction Tracking**: All revocation transactions are tracked

### 4. Institution Management
- ✅ **Blockchain Registration**: Institutions are registered on Base mainnet
- ✅ **Authorization Tracking**: Institution authorization status is tracked on blockchain
- ✅ **Statistics**: Institution statistics are fetched from blockchain

## API Endpoints

### Certificate Issuance
```bash
POST /api/certificates/issue
# Now automatically mints on blockchain if student wallet is provided
```

### Certificate Verification
```bash
GET /api/certificates/verify/:id
GET /api/certificates/verify/ipfs/:ipfsHash
GET /api/certificates/verify/token/:tokenId
# All now include blockchain verification
```

### Certificate Revocation
```bash
POST /api/certificates/:certificateId/revoke
# Admin only - revokes on both database and blockchain
```

### Blockchain Configuration
```bash
GET /api/blockchain/config
GET /api/blockchain/network
GET /api/institutions/:id/blockchain-status
```

## Setup Steps

### 1. Get Base Mainnet RPC URL
- **Free Option**: Use `https://mainnet.base.org`
- **Better Performance**: Use Alchemy or Infura
  - Alchemy: `https://base-mainnet.g.alchemy.com/v2/YOUR_KEY`
  - Infura: `https://base-mainnet.infura.io/v3/YOUR_KEY`

### 2. Get Private Key
- Create a wallet for your backend
- Export the private key
- **IMPORTANT**: Keep this secure and never commit to git

### 3. Fund the Wallet
- Send some ETH to your backend wallet on Base mainnet
- This will be used to pay for gas fees

### 4. Test the Integration
```bash
# Test certificate issuance
curl -X POST /api/certificates/issue \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "studentAddress=0x..." \
  -F "studentName=John Doe" \
  -F "courseName=Blockchain Development" \
  -F "certificateFile=@certificate.pdf"

# Test verification
curl GET /api/certificates/verify/ipfs/QmYourIPFSHash
```

## Transaction Flow

### Certificate Issuance Flow:
1. **Backend Receives Request**: Certificate issuance request with student wallet
2. **Database Save**: Certificate saved to MongoDB
3. **IPFS Upload**: Certificate file uploaded to IPFS
4. **Blockchain Mint**: Smart contract called to mint certificate
5. **Database Update**: Certificate updated with token ID and transaction hash
6. **Response**: Success response with blockchain transaction details

### Verification Flow:
1. **Request Received**: Verification request (ID, IPFS, or Token)
2. **Database Check**: Certificate found in database
3. **Blockchain Check**: Certificate verified on blockchain
4. **Sync**: Database updated if blockchain shows different validity
5. **Response**: Verification result with blockchain data

## Error Handling

### Blockchain Connection Failures:
- Certificates are still saved in database
- Error messages are logged
- Frontend receives graceful error responses

### Transaction Failures:
- Database operations continue
- Blockchain errors are recorded
- Retry mechanisms can be implemented

### Network Issues:
- Fallback to database-only operations
- Automatic retry on network recovery
- Comprehensive error logging

## Monitoring

### Transaction Tracking:
- All blockchain transactions are logged
- Transaction hashes are stored in database
- Block numbers are recorded for verification

### Error Monitoring:
- Blockchain errors are logged with details
- Failed transactions are tracked
- Performance metrics are available

## Security Considerations

### Private Key Security:
- Store private key in environment variables
- Never commit private keys to version control
- Use secure key management in production

### Access Control:
- Certificate revocation requires admin access
- Institution registration requires admin approval
- All blockchain operations are logged

### Rate Limiting:
- Implement rate limiting for blockchain operations
- Monitor gas costs and transaction frequency
- Set appropriate limits for certificate issuance

## Production Deployment

### Environment Setup:
```env
# Production environment variables
NODE_ENV=production
CONTRACT_ADDRESS=0xBD4228241dc6BC14C027bF8B6A24f97bc9872068
BASE_MAINNET_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
BLOCKCHAIN_PRIVATE_KEY=your_secure_private_key
```

### Monitoring:
- Set up alerts for blockchain transaction failures
- Monitor gas costs and wallet balance
- Track certificate issuance and verification metrics

### Backup:
- Regular database backups
- Transaction log backups
- Private key backup (secure)

## Support

For issues with blockchain integration:
1. Check environment variables are set correctly
2. Verify wallet has sufficient ETH for gas fees
3. Check RPC endpoint connectivity
4. Review transaction logs for errors
5. Ensure contract address is correct

The blockchain integration is now fully functional and will automatically handle all certificate operations on Base mainnet!
