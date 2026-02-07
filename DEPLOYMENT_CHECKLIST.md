# Production Deployment Checklist

This document outlines the critical configuration requirements for deploying the Smart Accounting Platform to production.

## Quick Reference: Environment Variables

### Frontend Build-Time Variables (Coolify Build Args)

These must be set as **build arguments** (not runtime env vars) in Coolify:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `VITE_API_URL` | **Yes** | Backend API base URL (no trailing slash, no /api path) | `https://api.zzpershub.nl` |
| `VITE_BUILD_VERSION` | No | Git commit SHA (for version tracking) | `abc1234` |
| `VITE_BUILD_TIMESTAMP` | No | Build timestamp (auto-generated if not set) | `2024-01-15T10:30:00Z` |

### Backend Runtime Variables (Coolify Environment Variables)

These are runtime environment variables for the backend:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `FRONTEND_URL` | **Yes** | Frontend URL for CORS and redirects | `https://zzpershub.nl` |
| `CORS_ORIGINS` | **Yes** | Comma-separated allowed CORS origins | `https://zzpershub.nl,https://www.zzpershub.nl` |
| `DATABASE_URL` | **Yes** | PostgreSQL connection string | `postgresql://...` |
| `SECRET_KEY` | **Yes** | JWT signing secret | `<random-secret>` |
| `REDIS_URL` | No | Redis connection string (for workers) | `redis://redis:6379` |

---

## Coolify Configuration: Step-by-Step

### Frontend Service Configuration

1. **Go to your frontend application settings in Coolify**

2. **Set Build Arguments** (Build Variables / Build Args section):
   ```
   VITE_API_URL=https://api.zzpershub.nl
   VITE_BUILD_VERSION=$GIT_SHA   (optional - Coolify may auto-inject this)
   ```
   
   > ⚠️ **CRITICAL**: These must be **build-time** variables. Setting them as runtime environment variables will NOT work because Vite bakes these values into the JavaScript at build time.

3. **Dockerfile Path**: `Dockerfile.frontend`

4. **Ports**: Map port `80` to your desired external port or use Coolify's automatic HTTPS.

### Backend Service Configuration

1. **Go to your backend application settings in Coolify**

2. **Set Environment Variables** (runtime):
   ```
   FRONTEND_URL=https://zzpershub.nl
   CORS_ORIGINS=https://zzpershub.nl,https://www.zzpershub.nl
   DATABASE_URL=postgresql://user:pass@db:5432/smartaccount
   SECRET_KEY=<your-secure-random-key>
   ```

3. **Dockerfile Path**: `backend/Dockerfile`

4. **Ports**: Map port `8000`

---

## How to Force a Frontend Rebuild

If UI changes aren't appearing after deployment, try these steps:

### 1. Verify the Build Actually Ran

Check the **Settings page** in your deployed app. It shows:
- **Version**: The `VITE_BUILD_VERSION` (commit SHA)
- **Build**: The `VITE_BUILD_TIMESTAMP`
- **API Base**: The `VITE_API_URL` that was baked in

If these values are outdated, the frontend wasn't rebuilt.

### 2. Force Rebuild in Coolify

1. Go to your frontend application in Coolify
2. Click **"Rebuild"** or **"Deploy"** (not just restart)
3. Ensure Coolify is using the latest commit from your branch
4. Check the build logs to verify the npm build actually ran

### 3. Clear Browser Cache

The frontend has proper cache headers (`Cache-Control: no-store, no-cache` for HTML), but browsers can be stubborn:

1. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. Open DevTools (F12) → Network tab → Check "Disable cache" → Refresh
3. Clear site data: DevTools → Application → Storage → Clear site data

### 4. Check for CDN/Proxy Caching

If you're using Cloudflare or another CDN:
- Purge the cache for your frontend domain
- Set appropriate cache rules (HTML should not be cached by CDN)

---

## Frontend Architecture Notes

### Single SPA with Role-Based UI

This platform uses a **single frontend application** with role-based navigation:

- **ZZP users** see: Dashboard, Documents, Transactions, Accountant Links
- **Accountant users** see: Bank, Clients, Suppliers, Ledger, P&L

The role is determined by the logged-in user's `role` field. There is NO separate "ZZP portal" or "Accountant portal" - it's one SPA that adapts its navigation based on user role.

**Key files:**
- `src/components/AppShell.tsx` - Contains role-based menu configuration
- `src/App.tsx` - Main routing logic

### Vite Build-Time Environment Variables

Vite replaces `import.meta.env.VITE_*` variables at build time. This means:

✅ **Correct**: Set `VITE_API_URL` as a Docker build argument
❌ **Wrong**: Set `VITE_API_URL` as a container runtime environment variable

The Dockerfile is configured to require `VITE_API_URL` at build time and will fail if it's not set.

---

## Common Mistakes

| Mistake | Why It's Wrong | Fix |
|---------|----------------|-----|
| Setting `VITE_API_URL` as runtime env | Vite needs it at build time | Set as Coolify build argument |
| Including `/api/v1` in `VITE_API_URL` | Frontend auto-appends this | Use base URL only: `https://api.zzpershub.nl` |
| Trailing slash in URLs | Causes double-slash bugs | Remove trailing slashes |
| Using `http://` in production | Mixed content blocked | Always use `https://` |
| Restarting instead of rebuilding | Only rebuilds update Vite env vars | Click "Rebuild" not "Restart" |

---

## Verification Steps After Deployment

1. **Check build info** on the Settings page:
   - Version matches expected commit SHA
   - Build timestamp is recent
   - API Base shows correct production URL

2. **Test API connectivity**:
   - Login page should show "API Connectivity" test panel
   - Click "Test" to verify frontend can reach backend

3. **Check browser console** (F12 → Console):
   - No CORS errors
   - No Network errors
   - API calls going to correct URL
