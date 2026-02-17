# PWA Lighthouse Checklist

This document provides step-by-step instructions for verifying the Progressive Web App (PWA) implementation using Chrome Lighthouse.

## Prerequisites

- Google Chrome browser (latest version recommended)
- HTTPS-enabled deployment (PWA features require HTTPS in production)
- Service worker registered and active

## Manual Testing with Chrome DevTools

### Step 1: Open Chrome DevTools

1. Navigate to your deployed application in Chrome
2. Open Chrome DevTools:
   - **Windows/Linux**: Press `F12` or `Ctrl+Shift+I`
   - **macOS**: Press `Cmd+Option+I`
3. Click on the **Lighthouse** tab

### Step 2: Configure Lighthouse

1. In the Lighthouse panel, ensure the following are selected:
   - ☑ **Categories → Progressive Web App**
   - ☑ **Device → Mobile** (recommended for PWA testing)
   - **Mode**: Choose "Navigation" (default)

2. **Important**: Use Incognito Mode for accurate results
   - Close the current window
   - Open Chrome in Incognito mode: `Ctrl+Shift+N` (Windows/Linux) or `Cmd+Shift+N` (macOS)
   - Navigate to your application
   - Open DevTools and go to Lighthouse tab
   - This prevents browser extensions from interfering with the test

### Step 3: Run Lighthouse Audit

1. Click the **"Analyze page load"** button
2. Wait for the audit to complete (usually 30-60 seconds)
3. Review the results

## PWA Requirements Checklist

Lighthouse will verify the following PWA criteria:

### ✅ Installability

- [ ] **Registers a service worker** that controls page and start_url
- [ ] **Web app manifest meets the installability requirements**
  - Has a valid `name` or `short_name`
  - Has a valid `start_url`
  - Has a valid `display` mode (standalone, fullscreen, or minimal-ui)
  - Has valid icons (at least 192x192px and 512x512px)
  - Has a valid `theme_color`
- [ ] **Has a `<meta name="theme-color">` tag** in HTML
- [ ] **Content is sized correctly for the viewport**

### ✅ PWA Optimized

- [ ] **Configured for a custom splash screen**
  - Manifest has name, background_color, theme_color, and icons
- [ ] **Sets a theme color for the address bar**
  - Both manifest and HTML meta tag present
- [ ] **Has maskable icon** for adaptive Android icons
- [ ] **Content properly sized** for viewport (no horizontal scroll)
- [ ] **Provides a valid apple-touch-icon**

### ✅ Offline Experience

- [ ] **Current page responds with a 200 when offline**
  - Service worker provides offline fallback
  - Navigation requests work offline after first visit
- [ ] **Start URL responds with 200 when offline**
- [ ] **Offline fallback page available**

### ✅ HTTPS & Security

- [ ] **Uses HTTPS** (required for service workers)
- [ ] **Redirects HTTP traffic to HTTPS**

### ✅ Performance (Supporting Metrics)

While not strictly PWA requirements, these improve user experience:

- [ ] **Fast First Contentful Paint** (under 2 seconds)
- [ ] **Fast Time to Interactive** (under 3.8 seconds on mobile)
- [ ] **Fast page load** on mobile networks

## Target Scores

### Minimum Target

- **PWA Score**: ≥ **90/100**

This score indicates a production-ready PWA that meets Google's standards.

### Interpreting Results

- **100**: Perfect PWA implementation
- **90-99**: Excellent, minor optimizations possible
- **80-89**: Good, some improvements recommended
- **Below 80**: Needs attention before production deployment

## Common Issues and Fixes

### Issue: "Does not register a service worker"

**Fix**: Ensure service worker is registered in production:
- Check that `VITE_ENABLE_PWA=true` is set in production
- Verify `/service-worker.js` is accessible
- Check browser console for registration errors

### Issue: "Web app manifest does not meet installability requirements"

**Fix**: Verify manifest.json has all required fields:
```json
{
  "name": "Smart Accounting Platform",
  "short_name": "Smart Accounting",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#0F172A",
  "background_color": "#0F172A",
  "icons": [
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### Issue: "Current page does not respond with 200 when offline"

**Fix**: Test offline functionality:
1. Load the page while online
2. Open DevTools → Application → Service Workers
3. Check "Offline" checkbox
4. Refresh the page
5. Should show cached content or offline fallback

### Issue: "Uses HTTP instead of HTTPS"

**Fix**: Deploy to HTTPS-enabled hosting:
- Use a reverse proxy with TLS certificate
- Configure Coolify/Traefik with HTTPS
- Obtain a free certificate from Let's Encrypt

## Automated Testing (Optional)

### Install Lighthouse CLI

```bash
npm install -g lighthouse
```

### Run Lighthouse from Command Line

```bash
# Run PWA audit on deployed site
lighthouse https://your-app-url.com \
  --only-categories=pwa \
  --chrome-flags="--headless" \
  --output=html \
  --output-path=./lighthouse-pwa-report.html

# Open the report
open ./lighthouse-pwa-report.html
```

### CI/CD Integration (Optional)

Add to `.github/workflows/lighthouse.yml`:

```yaml
name: Lighthouse PWA Check

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Lighthouse CI
        uses: treosh/lighthouse-ci-action@v9
        with:
          urls: |
            https://your-deployed-url.com
          configPath: './lighthouserc.json'
          uploadArtifacts: true
```

## NPM Script

Add to `package.json`:

```json
{
  "scripts": {
    "lighthouse:pwa": "lighthouse https://your-app-url.com --only-categories=pwa --view"
  }
}
```

Run with:
```bash
npm run lighthouse:pwa
```

**Note**: Replace `https://your-app-url.com` with your actual deployed URL.

## Verification Frequency

### When to Run Lighthouse

- ✅ Before initial production deployment
- ✅ After PWA-related code changes
- ✅ After manifest or service worker updates
- ✅ Periodically (monthly) for production monitoring
- ✅ Before major releases

## Platform-Specific Testing

### Android (Chrome)

1. Visit the site on Android Chrome
2. Look for "Install app" banner or menu option
3. Install the app
4. Verify it opens in standalone mode
5. Test offline functionality

### iOS (Safari)

1. Visit the site on iOS Safari
2. Tap Share → "Add to Home Screen"
3. Open the app from home screen
4. Verify standalone mode
5. Test offline functionality

## Expected Results for This Project

Based on the current implementation, you should see:

- ✅ **Service Worker**: Registered and controlling pages
- ✅ **Manifest**: Valid with all required fields
- ✅ **Icons**: 192x192, 512x512, and maskable variants present
- ✅ **Offline**: Fallback page and cached app shell available
- ✅ **HTTPS**: Required for production deployment
- ✅ **Theme Color**: Configured in manifest and HTML
- ✅ **Installable**: Meets all installability criteria

### Target Score: 90-100

The implementation aims for a PWA score between 90 and 100, indicating production-ready status.

## Troubleshooting

### DevTools Not Showing Lighthouse Tab

**Solution**: Update Chrome to the latest version or use Chrome Canary.

### Lighthouse Stuck or Timing Out

**Solution**:
1. Close other tabs and extensions
2. Use Incognito mode
3. Ensure stable network connection
4. Try running on a different page (e.g., /dashboard)

### Low Performance Scores

**Note**: Performance scores are separate from PWA functionality. A perfect PWA can have varying performance scores depending on hosting, network, and device.

## Additional Resources

- [Google PWA Checklist](https://web.dev/pwa-checklist/)
- [Lighthouse PWA Audits](https://web.dev/lighthouse-pwa/)
- [Service Worker Cookbook](https://serviceworke.rs/)
- [Web App Manifest Spec](https://www.w3.org/TR/appmanifest/)

## Support

If you encounter persistent issues with Lighthouse audits, check:
1. Browser console for errors
2. Application tab → Service Workers for registration status
3. Network tab for failed requests
4. Manifest tab for manifest parsing errors

---

**Last Updated**: 2026-02-17  
**Version**: 1.0
