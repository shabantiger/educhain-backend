# EduChain Verification Process

## Overview
The verification system ensures only legitimate educational institutions can issue certificates on the blockchain.

## Verification Flow

### 1. Institution Registration
When an institution registers, they must provide:
- Institution name and contact details
- Registration number
- Wallet address
- Verification documents (optional during registration)

### 2. Document Submission
Institutions can submit verification documents via:
```javascript
POST /api/institutions/verification-documents
{
  "documents": [
    {
      "type": "registration_certificate",
      "url": "https://example.com/cert.pdf",
      "description": "Official registration certificate"
    },
    {
      "type": "accreditation",
      "url": "https://example.com/accreditation.pdf", 
      "description": "Accreditation document"
    }
  ]
}
```

### 3. Admin Review Process

#### Get All Verification Requests
```bash
GET /api/admin/verification-requests
Headers: admin-email: admin@educhain.com
```

#### Review a Specific Request
```bash
POST /api/admin/verification-requests/{requestId}/review
Headers: admin-email: admin@educhain.com
{
  "status": "approved", // or "rejected"
  "comments": "Documents verified successfully"
}
```

### 4. Verification Status Check
Institutions can check their verification status:
```bash
GET /api/institutions/verification-status
Headers: Authorization: Bearer {token}
```

## Admin Dashboard Features Needed

### Verification Management
- View all pending verification requests
- Review submitted documents
- Approve/reject with comments
- Track verification history

### Document Types to Verify
- Official registration certificates
- Accreditation documents
- Government recognition papers
- Academic credentials
- Business licenses

## Security Considerations
- Document authenticity verification
- Digital signature validation
- Cross-reference with government databases
- Regular re-verification process 