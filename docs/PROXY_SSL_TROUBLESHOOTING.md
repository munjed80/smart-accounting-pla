# Proxy & SSL Troubleshooting Guide for Coolify

This guide explains the required Coolify settings and troubleshooting steps for deploying Smart Accounting Platform behind Coolify's reverse proxy with proper TLS/SSL certificates.

## Production URLs

- **Frontend**: https://zzpershub.nl (+ optional www.zzpershub.nl)
- **API Backend**: https://api.zzpershub.nl

## Required Coolify Domain Settings

### ⚠️ Critical: Domain Format

Domains in Coolify **MUST** be entered:
- **WITHOUT** scheme (no `https://` or `http://`)
- **WITHOUT** trailing paths (no `/api` suffix)

#### Correct Examples:
```
Frontend domain:  zzpershub.nl
                  www.zzpershub.nl  (optional alias)
Backend domain:   api.zzpershub.nl
```

#### Incorrect Examples (will cause errors):
```
❌ https://zzpershub.nl           (has scheme)
❌ api.zzpershub.nl/api           (has path)
❌ https://api.zzpershub.nl/      (has scheme and trailing slash)
```

### Proxy Settings

Ensure the following proxy settings are configured in Coolify:

1. **Expose ports 80 and 443** - Required for HTTP→HTTPS redirect and TLS termination
2. **Enable Let's Encrypt** - For automatic TLS certificate issuance
3. **Proxy type**: Traefik (default in Coolify)

### Environment Variables

Set these environment variables for the **backend** service:

```bash
# Backend API URL (used for internal references)
APP_URL=https://api.zzpershub.nl

# Frontend URL (used in email links - verification, password reset)
FRONTEND_URL=https://zzpershub.nl

# CORS Origins (must include the frontend domain with https)
CORS_ORIGINS=https://zzpershub.nl,https://www.zzpershub.nl

# Email configuration (required for auth flows)
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=no-reply@zzpershub.nl
SUPPORT_EMAIL=support@zzpershub.nl
```

Set this environment variable for the **frontend** service (at build time):

```bash
# API URL for frontend (must match backend domain with https)
VITE_API_URL=https://api.zzpershub.nl
```

## Common Issues and Solutions

### Issue: "Host matcher empty" / `Host(``)`

**Symptom**: Traefik logs show:
```
level=error msg="Host matcher is empty"
```

**Cause**: Domain field in Coolify is empty or contains only whitespace.

**Solution**:
1. Go to Coolify dashboard → Your application → Settings
2. Verify the "Domain" field contains a valid domain (e.g., `api.zzpershub.nl`)
3. Remove any leading/trailing whitespace
4. Save and restart the proxy

### Issue: "Router defined multiple times"

**Symptom**: Traefik logs show:
```
level=error msg="Router defined multiple times with different configurations"
```

**Cause**: Multiple services are trying to claim the same domain, or duplicate router configurations exist.

**Solution**:
1. **Reset Proxy Configuration** in Coolify dashboard
2. Ensure each domain is only assigned to ONE service
3. **Restart Proxy** after making changes
4. If issue persists, restart the entire Coolify instance

### Issue: "Invalid TLS Certificate" / "NET::ERR_CERT_AUTHORITY_INVALID"

**Symptom**: Browser shows certificate error or frontend shows "invalid TLS certificate" warning.

**Cause**: Let's Encrypt certificate hasn't been issued or renewed.

**Solution**:
1. Verify domain DNS points to your server's IP address
2. Ensure ports 80 and 443 are open in firewall
3. In Coolify: 
   - Enable "HTTPS" / Let's Encrypt for the service
   - Click "Force Regenerate Certificate" if available
4. Wait 2-5 minutes for certificate issuance
5. Check Traefik logs for ACME/Let's Encrypt errors

### Issue: CORS Errors

**Symptom**: Browser console shows:
```
Access to XMLHttpRequest at 'https://api.zzpershub.nl/...' 
from origin 'https://zzpershub.nl' has been blocked by CORS policy
```

**Cause**: `CORS_ORIGINS` environment variable doesn't include the frontend domain.

**Solution**:
1. Set `CORS_ORIGINS=https://zzpershub.nl,https://www.zzpershub.nl` in backend environment
2. **Restart the backend** service after changing environment variables
3. Verify with: `curl -I -X OPTIONS https://api.zzpershub.nl/api/v1/auth/register -H "Origin: https://zzpershub.nl"`

### Issue: "No available server" / 502 Bad Gateway

**Symptom**: Proxy returns 502 or "no available server" error.

**Cause**: Backend container isn't running or isn't healthy.

**Solution**:
1. Check container status in Coolify dashboard
2. View container logs for startup errors
3. Verify health check: `curl http://localhost:8000/health` (from within the server)
4. Check database connectivity (common cause of health check failures)

## Verification Script

Run the verification script to check your production deployment:

```bash
./scripts/verify-production.sh
```

This script checks:
- API health endpoint returns 200 with valid JSON
- CORS headers are correctly configured for the frontend origin
- TLS certificate is valid

## Quick Reset Procedure

If you're seeing persistent proxy errors:

1. **In Coolify Dashboard**:
   - Stop all affected services
   - Go to Settings → Proxy → Click "Reset Proxy Configuration"
   - Click "Restart Proxy"
   
2. **Verify domain settings** for each service (no schemes, no paths)

3. **Restart services** one by one:
   - Start database first
   - Start backend (wait for healthy status)
   - Start frontend

4. **Test endpoints**:
   ```bash
   curl -v https://api.zzpershub.nl/health
   curl -v https://zzpershub.nl
   ```

## Email Link Configuration

For email verification and password reset to work correctly:

1. `FRONTEND_URL` must point to your frontend (e.g., `https://zzpershub.nl`)
2. Verification emails will contain links like: `https://zzpershub.nl/verify-email?token=...`
3. Password reset emails will contain links like: `https://zzpershub.nl/reset-password?token=...`

⚠️ If emails contain `localhost` URLs, the `FRONTEND_URL` environment variable is not set correctly.
