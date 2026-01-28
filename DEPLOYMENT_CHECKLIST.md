# Production Deployment Checklist

This document outlines the critical configuration requirements for deploying the Smart Accounting Platform to production.

## Frontend (Vite + React on Nginx)

### Environment Variables (Build-Time)

> **IMPORTANT**: Vite environment variables must be set **at build time**, not runtime.
> This means you must configure these in your Coolify (or other CI/CD) build settings.

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_API_URL` | **Yes** | The full URL of the backend API | `https://api.zzpershub.nl` |

**Coolify Configuration:**
1. Go to your application settings in Coolify
2. Navigate to "Build Variables" or "Environment Variables (Build)"
3. Add `VITE_API_URL=https://api.zzpershub.nl`
4. Trigger a new build for changes to take effect

**Common Mistakes:**
- ❌ Setting `VITE_API_URL` as a runtime environment variable (won't work - Vite needs it at build time)
- ❌ Including a trailing slash: `https://api.zzpershub.nl/` (may cause double slashes in API paths)
- ❌ Using `http://` instead of `https://` in production (will be blocked by browsers due to mixed content)

## Backend (FastAPI)

### CORS Configuration

The backend must be configured to accept requests from all frontend origins.

**Required `CORS_ORIGINS` value:**
```
CORS_ORIGINS=https://zzpershub.nl,https://www.zzpershub.nl
```

If you have additional subdomains or staging environments, include them as well:
```
CORS_ORIGINS=https://zzpershub.nl,https://www.zzpershub.nl,https://staging.zzpershub.nl
```

**Note:** Do NOT include trailing slashes in origins.

### TLS/SSL Certificates

> **CRITICAL**: The API domain (`api.zzpershub.nl`) **must** have a valid TLS certificate.

**Why this matters:**
- Modern browsers block requests from HTTPS pages to HTTP endpoints (mixed content)
- Browsers will also block requests if the TLS certificate is expired, self-signed, or invalid
- These failures appear as "Network Error" in the frontend with no additional details

**Verification:**
```bash
# Check if the certificate is valid
curl -v https://api.zzpershub.nl/health 2>&1 | grep -A 5 "SSL certificate"

# Or use openssl
openssl s_client -connect api.zzpershub.nl:443 -servername api.zzpershub.nl </dev/null 2>/dev/null | openssl x509 -noout -dates
```

**Coolify Auto-SSL:**
- Ensure Coolify's Let's Encrypt integration is enabled for the API domain
- Verify the certificate is issued and not expired

## Health Check Verification

After deployment, verify connectivity:

1. **Backend Health:**
   ```bash
   curl https://api.zzpershub.nl/health
   ```
   Should return `{"status": "healthy", ...}`

2. **Frontend API Connectivity:**
   - Navigate to the login page
   - Check the "API Connectivity" panel at the bottom
   - Click "Test" to verify the frontend can reach the backend
   - If it fails, check browser console for detailed error messages

## Troubleshooting

### "Login/Register appears to do nothing"

1. **Check browser console (F12)** for error messages
2. **Look for CORS errors**: `Access-Control-Allow-Origin` issues indicate the backend CORS_ORIGINS is misconfigured
3. **Look for Network Error**: Usually indicates TLS certificate problems or backend is unreachable
4. **Check the API Connectivity test** on the login page for diagnostics

### "Network Error" in browser console

Possible causes:
- Backend is down or unreachable
- TLS certificate is invalid/expired
- CORS is blocking the request
- DNS resolution failure

### Frontend shows "API Configuration Error" banner

The `VITE_API_URL` environment variable was not set at build time. Rebuild the frontend with the correct value.
