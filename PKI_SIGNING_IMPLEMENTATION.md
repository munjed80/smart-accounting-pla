# PKIoverheid Signing Implementation Guide

## Overview

This document describes the PKIoverheid (X.509) certificate signing implementation for VAT submissions. The implementation ensures secure certificate handling with strong auditability while preparing for future Digipoort integration.

## Architecture

### Components

1. **Certificate Model** (`app/models/certificate.py`)
   - Stores certificate metadata only (NOT the certificate itself)
   - Tracks validity, fingerprint, subject, issuer
   - Supports soft deletion

2. **Certificate Service** (`app/services/certificate_service.py`)
   - Registers certificates from filesystem
   - Validates PKIoverheid certificates
   - Loads certificates for signing operations
   - Manages certificate lifecycle

3. **Signing Service** (`app/services/signing_service.py`)
   - Signs XML documents with PKIoverheid certificates
   - Implements XMLDSig standard
   - Provides signature verification

4. **VAT Submission Service** (`app/services/vat_submission_service.py`)
   - Integrates signing into submission workflow
   - Stores signed XML and signature info

5. **API Endpoints** (`app/api/v1/certificates.py`)
   - Certificate registration
   - Certificate listing
   - Certificate management

## Security Principles

### Certificate Storage

**Critical Rule:** Private keys and certificates are NEVER stored in the database.

- ✅ **Do:** Store certificates on filesystem with secure permissions
- ✅ **Do:** Reference certificates via environment variables or mounted volumes
- ✅ **Do:** Store only metadata (fingerprint, subject, issuer, validity) in DB
- ❌ **Don't:** Store raw PFX blobs in database
- ❌ **Don't:** Store private keys in database
- ❌ **Don't:** Log or expose actual certificate data

### Certificate Provisioning Methods

#### Method 1: Environment Variables (Recommended for Coolify)

```bash
# Set environment variable pointing to certificate file
PKI_CERT_PATH=/secrets/pki-overheid-cert.pfx
PKI_CERT_PASSPHRASE=your_secure_passphrase

# Register certificate via API
POST /api/accountant/clients/{id}/certificates/register
{
  "type": "PKI_OVERHEID",
  "storage_ref": "$PKI_CERT_PATH",
  "passphrase_ref": "$PKI_CERT_PASSPHRASE",
  "friendly_name": "BTW Certificaat 2026",
  "purpose": "BTW_SUBMISSION"
}
```

#### Method 2: Direct Filesystem Path

```bash
# Certificate mounted at known path
POST /api/accountant/clients/{id}/certificates/register
{
  "type": "PKI_OVERHEID",
  "storage_ref": "/secrets/pki-overheid-cert.pfx",
  "passphrase_ref": "/secrets/pki-cert-passphrase.txt",
  "friendly_name": "BTW Certificaat 2026"
}
```

#### Method 3: Coolify Secrets

```bash
# In Coolify, create secrets:
# - Name: PKI_CERT
# - Value: (upload certificate file)
# - Mount as: /secrets/pki-cert.pfx
#
# Coolify automatically creates environment variable:
# COOLIFY_PKI_CERT=/secrets/pki-cert.pfx

# Register certificate via API
POST /api/accountant/clients/{id}/certificates/register
{
  "type": "PKI_OVERHEID",
  "storage_ref": "coolify://pki-cert",
  "passphrase_ref": "coolify://pki-passphrase"
}
```

## Database Schema

### certificates table

Stores certificate metadata only:

```sql
CREATE TABLE certificates (
    id UUID PRIMARY KEY,
    administration_id UUID NOT NULL REFERENCES administrations(id),
    type VARCHAR(50) NOT NULL,                    -- e.g., "PKI_OVERHEID"
    storage_ref VARCHAR(500) NOT NULL,            -- Path/reference to cert file
    passphrase_ref VARCHAR(500),                  -- Reference to passphrase
    
    -- Certificate metadata (extracted from cert)
    fingerprint VARCHAR(64) NOT NULL UNIQUE,      -- SHA256 fingerprint
    subject VARCHAR(500) NOT NULL,                -- Subject DN
    issuer VARCHAR(500) NOT NULL,                 -- Issuer DN
    serial_number VARCHAR(100) NOT NULL,          
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_to TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Optional metadata
    friendly_name VARCHAR(200),
    purpose VARCHAR(100),                         -- e.g., "BTW_SUBMISSION"
    
    -- Audit fields
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);
```

### vat_submissions table (updated)

Added certificate reference:

```sql
ALTER TABLE vat_submissions 
ADD COLUMN certificate_id UUID REFERENCES certificates(id);
```

## API Endpoints

### POST /api/accountant/clients/{id}/certificates/register

Register a new PKIoverheid certificate.

**Request:**
```json
{
  "type": "PKI_OVERHEID",
  "storage_ref": "$PKI_CERT_PATH",
  "passphrase_ref": "$PKI_CERT_PASSPHRASE",
  "friendly_name": "BTW Certificaat 2026",
  "purpose": "BTW_SUBMISSION"
}
```

**Response:**
```json
{
  "certificate": {
    "id": "uuid",
    "administration_id": "uuid",
    "type": "PKI_OVERHEID",
    "storage_ref": "$PKI_CERT_PATH",
    "has_passphrase": true,
    "fingerprint": "sha256_hex",
    "subject": "CN=...,O=...",
    "issuer": "CN=PKIoverheid,...",
    "serial_number": "123456",
    "valid_from": "2026-01-01T00:00:00Z",
    "valid_to": "2027-01-01T00:00:00Z",
    "friendly_name": "BTW Certificaat 2026",
    "purpose": "BTW_SUBMISSION",
    "created_at": "2026-02-17T19:50:00Z",
    "is_active": true,
    "is_valid": true,
    "days_until_expiry": 318
  },
  "message": "Certificate registered successfully"
}
```

### GET /api/accountant/clients/{id}/certificates

List all certificates for a client.

**Query Parameters:**
- `include_expired` (boolean): Whether to include expired certificates

**Response:**
```json
{
  "certificates": [...],
  "total": 2
}
```

### GET /api/accountant/clients/{id}/certificates/{cert_id}

Get details of a specific certificate.

### DELETE /api/accountant/clients/{id}/certificates/{cert_id}

Soft delete a certificate (marks as inactive).

## VAT Submission Workflow

### Step 1: Prepare Submission (DRAFT status)

```http
POST /api/accountant/clients/{id}/vat/{period_id}/submit/prepare
{
  "kind": "VAT"
}
```

Response:
- Creates submission in DRAFT status
- Generates unsigned XML payload
- Returns validation errors (if any)

### Step 2: Queue Submission (sign and move to QUEUED)

```http
POST /api/accountant/clients/{id}/vat/submissions/{submission_id}/queue
{
  "certificate_id": "uuid"
}
```

This endpoint:
1. Validates the payload
2. Loads certificate from filesystem
3. Signs XML with PKIoverheid certificate
4. Embeds XMLDSig signature
5. Updates status to QUEUED
6. Stores signed XML and signature info

Response:
```json
{
  "submission_id": "uuid",
  "status": "QUEUED",
  "correlation_id": "uuid"
}
```

### Step 3: Future - Submit to Digipoort

(Phase B - not yet implemented)

## Certificate Validation

The system validates certificates on registration:

1. **File exists:** Certificate file must be accessible
2. **Valid format:** Must be PKCS#12 (.pfx) or PEM format
3. **PKIoverheid issuer:** Issuer must be recognized PKIoverheid CA:
   - PKIoverheid
   - Logius
   - KPN
   - DigiIdentity
   - Quo Vadis
4. **Not expired:** Current date must be within validity period
5. **Key usage:** Certificate must have digital signature capability

## XML Signing Process

### Algorithm: RSA-SHA256 with XMLDSig

1. **Canonicalization:** XML is canonicalized (C14N)
2. **Digest calculation:** SHA256 digest of canonicalized XML
3. **Signature generation:** RSA private key signs the digest
4. **Signature embedding:** XMLDSig `<Signature>` element added to XML

### Signature Structure

```xml
<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <ds:SignedInfo>
    <ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
    <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
    <ds:Reference URI="">
      <ds:Transforms>
        <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
      </ds:Transforms>
      <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
      <ds:DigestValue>base64_digest</ds:DigestValue>
    </ds:Reference>
  </ds:SignedInfo>
  <ds:SignatureValue>base64_signature</ds:SignatureValue>
  <ds:KeyInfo>
    <ds:X509Data>
      <ds:X509Certificate>base64_certificate</ds:X509Certificate>
    </ds:X509Data>
  </ds:KeyInfo>
</ds:Signature>
```

## Audit Trail

Every signed submission stores:

1. **payload_xml:** Original unsigned XML
2. **payload_hash:** SHA256 hash of payload
3. **signed_xml:** Signed XML with embedded signature
4. **certificate_id:** Reference to certificate used
5. **correlation_id:** Unique tracking ID
6. **connector_response.signature_info:**
   - algorithm: "RSA-SHA256"
   - digest_method: "SHA256"
   - digest_value: Base64 digest
   - signature_value: Base64 signature
   - certificate_fingerprint: SHA256 of cert
   - certificate_subject: Subject DN
   - certificate_issuer: Issuer DN
   - signature_timestamp: ISO 8601 timestamp

This ensures complete auditability of signing operations.

## Deployment

### Coolify Setup

1. **Upload Certificate:**
   - In Coolify project, go to Secrets
   - Create new secret: `pki-cert`
   - Upload .pfx file
   - Mount as: `/secrets/pki-cert.pfx`

2. **Set Passphrase:**
   - Create secret: `pki-passphrase`
   - Value: Certificate passphrase
   - Mount as environment variable

3. **Environment Variables:**
   ```bash
   PKI_CERT_PATH=/secrets/pki-cert.pfx
   PKI_CERT_PASSPHRASE=<from secret>
   ```

4. **Register Certificate:**
   - Use API to register certificate
   - Accountant can manage via UI (future)

### File Permissions

Ensure certificate files have restricted permissions:

```bash
chmod 600 /secrets/pki-cert.pfx
chown app:app /secrets/pki-cert.pfx
```

## Testing

### Unit Tests

Run certificate service tests:
```bash
cd backend
pytest tests/test_certificate_service.py -v
```

Run signing service tests:
```bash
pytest tests/test_signing_service.py -v
```

### Manual Testing with Test Certificate

Generate test certificate (for development only):
```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/O=PKIoverheid Test/CN=test.pkioverheid.nl"
openssl pkcs12 -export -out test-cert.pfx -inkey key.pem -in cert.pem -passout pass:test123
```

Register test certificate:
```bash
export PKI_CERT_PATH=/path/to/test-cert.pfx
export PKI_CERT_PASSPHRASE=test123

curl -X POST http://localhost:8000/api/accountant/clients/{id}/certificates/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "PKI_OVERHEID",
    "storage_ref": "$PKI_CERT_PATH",
    "passphrase_ref": "$PKI_CERT_PASSPHRASE",
    "friendly_name": "Test Certificate"
  }'
```

## Troubleshooting

### Certificate not found

**Error:** `Certificate file not found: /secrets/pki-cert.pfx`

**Solution:**
- Verify file exists at specified path
- Check file permissions
- Ensure path is correct in environment variable

### Certificate load failed

**Error:** `Failed to load certificate in PEM format`

**Solution:**
- Verify certificate format (PKCS#12 or PEM)
- Check passphrase is correct
- Ensure certificate file is not corrupted

### Certificate validation failed

**Error:** `Certificate issuer not recognized as PKIoverheid CA`

**Solution:**
- Ensure certificate is issued by recognized PKIoverheid CA
- For testing, issuer must contain one of: PKIoverheid, Logius, KPN, DigiIdentity, Quo Vadis

### Certificate expired

**Error:** `Certificate expired on 2025-12-31T23:59:59Z`

**Solution:**
- Obtain new certificate from PKIoverheid CA
- Register new certificate
- Delete old certificate

## Future Enhancements

### Phase B - Digipoort Integration

Future work will add:
- Actual network submission to Digipoort
- Status polling and receipt handling
- Automatic retry logic
- Certificate expiry monitoring

### Frontend UI

Future UI features:
- Certificate management dashboard
- Upload certificate wizard
- Certificate status indicators
- Expiry warnings

## Security Considerations

1. **Never log certificate data:** Ensure logs don't contain certificate content or private keys
2. **Restrict file permissions:** Certificate files should be readable only by application user
3. **Monitor certificate expiry:** Alert administrators before certificates expire
4. **Audit all operations:** Log all certificate registration and signing operations
5. **Rotate certificates regularly:** Follow PKIoverheid best practices for certificate rotation

## References

- [PKIoverheid](https://www.logius.nl/diensten/pkioverheid)
- [XMLDSig Standard](https://www.w3.org/TR/xmldsig-core/)
- [Digipoort Documentation](https://www.logius.nl/diensten/digipoort)
