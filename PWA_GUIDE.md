# PWA Implementation Guide

## Overview
This application is now a production-grade Progressive Web App (PWA) that can be installed on mobile devices and works offline.

## Features Implemented

### 1. PWA Manifest
- **Name**: Smart Accounting Platform
- **Short Name**: Smart Accounting  
- **Icons**: 192x192 and 512x512 (regular and maskable)
- **Display**: Standalone (fullscreen app experience)
- **Theme Color**: #0F172A (dark blue)
- **Background Color**: #0F172A

### 2. Offline Strategy (Workbox)
- **App Shell Caching**: Index.html and core assets cached automatically
- **Static Assets**: CacheFirst strategy for JS, CSS, fonts (30-day cache)
- **API Calls**: NetworkFirst strategy with 5-minute cache fallback
- **Images**: CacheFirst strategy with 30-day cache
- **Offline Fallback**: Custom `/offline.html` page shown when offline

### 3. Install UX (Dutch)
- **Android/Desktop**: Automatically detects `beforeinstallprompt` event and shows "Installeer app" button
- **iOS**: Shows installation instructions in Dutch when prompt not available
- **Features**:
  - Dismissible prompt (saved to localStorage)
  - Shows benefits: "Snellere toegang en offline werken"

### 4. Update Notification (Dutch)
- **Update Detection**: Shows "Nieuwe versie beschikbaar" banner when new version is ready
- **Update Action**: "Herladen" button to activate new version
- **Offline Ready**: Shows notification when app is ready for offline use

### 5. Production Build
- Service Worker is disabled in development (`devOptions.enabled: false`)
- Only activates in production builds (HTTPS required)
- Auto-update strategy (`registerType: 'autoUpdate'`)

## Files Changed

### New Files
1. `public/icon.svg` - Base SVG icon
2. `public/icon-192x192.png` - App icon (192x192)
3. `public/icon-512x512.png` - App icon (512x512)
4. `public/icon-192x192-maskable.png` - Maskable icon (192x192)
5. `public/icon-512x512-maskable.png` - Maskable icon (512x512)
6. `public/offline.html` - Offline fallback page
7. `src/components/PWAInstallPrompt.tsx` - Install prompt component
8. `src/components/PWAUpdatePrompt.tsx` - Update notification component

### Modified Files
1. `vite.config.ts` - Added VitePWA plugin with Workbox configuration
2. `index.html` - Added PWA meta tags and icons
3. `src/App.tsx` - Integrated PWA components
4. `src/vite-end.d.ts` - Added type definitions for PWA
5. `package.json` - Added `vite-plugin-pwa` and `workbox-window` dependencies

## Testing Instructions

### Testing on Android

#### Prerequisites
- Android device or emulator
- Chrome browser (latest version)
- HTTPS connection (PWA requires HTTPS in production)

#### Steps
1. **Deploy to Production/Staging** (HTTPS required):
   ```bash
   npm run build
   # Deploy dist/ folder to your HTTPS server
   ```

2. **Open in Chrome**:
   - Navigate to your app URL (e.g., `https://yourdomain.com`)
   - Wait for the app to load completely

3. **Test Install Prompt**:
   - Look for the "Installeer app" banner at the bottom right
   - Click "Installeer" button
   - App should be added to home screen

4. **Test Installed App**:
   - Open the app from home screen
   - Should open in standalone mode (no browser UI)
   - Check that theme color matches app colors

5. **Test Offline Mode**:
   - With app open, turn on Airplane Mode
   - Navigate to different pages (should still work for cached content)
   - Try to access uncached pages (should show offline.html)

6. **Test Update Notification**:
   - Deploy a new version of the app
   - Refresh the app in browser
   - Should see "Nieuwe versie beschikbaar" banner
   - Click "Herladen" to activate new version

#### Chrome DevTools Testing (Desktop)
1. **Open Chrome DevTools** (F12)
2. **Application Tab** → Manifest:
   - Verify manifest is loaded correctly
   - Click "Add to home screen" to test install
3. **Application Tab** → Service Workers:
   - Verify service worker is registered
   - Test offline mode with "Offline" checkbox
4. **Application Tab** → Cache Storage:
   - Verify static-resources cache is populated
   - Verify images and API cache entries

### Testing on iOS (iPhone/iPad)

#### Prerequisites  
- iOS device (real device required, simulator doesn't support PWA install)
- Safari browser
- HTTPS connection

#### Steps
1. **Deploy to Production** (HTTPS required):
   ```bash
   npm run build
   # Deploy dist/ folder to your HTTPS server
   ```

2. **Open in Safari**:
   - Navigate to your app URL (e.g., `https://yourdomain.com`)
   - Wait for the app to load

3. **Test Install Instructions**:
   - iOS doesn't support `beforeinstallprompt` event
   - The app detects iOS and shows Dutch instructions:
     - "Installeer de app op iOS:"
     - Step-by-step guide to add to home screen

4. **Manual Install**:
   - Tap the Share button (⎋) at the bottom
   - Scroll down and tap "Zet op beginscherm" (Add to Home Screen)
   - Tap "Voeg toe" (Add)

5. **Test Installed App**:
   - Open app from home screen
   - Should open in standalone mode
   - Check splash screen uses app icon and theme color
   - Verify no Safari UI is visible

6. **Test Offline Mode**:
   - With app open, turn on Airplane Mode
   - Navigate to different pages
   - Should work for cached content
   - Uncached pages show offline.html

7. **Test Update**:
   - iOS Safari doesn't show install prompt for updates
   - Updates happen automatically on next app launch
   - Users need to manually check for updates by closing and reopening app

#### iOS Limitations
- No `beforeinstallprompt` event (manual install required)
- No update notification (automatic on relaunch)
- Service Worker support is limited but sufficient for PWA

### Testing on Desktop (Chrome/Edge)

1. **Open in Chrome/Edge**:
   - Navigate to your app URL
   - Build must be production build on HTTPS

2. **Test Install**:
   - Look for install icon in address bar (⊕)
   - Or use the "Installeer app" banner
   - Click to install as desktop app

3. **Test Installed Desktop App**:
   - Open from Start Menu/Applications
   - Should open in standalone window
   - No browser address bar

4. **Test Offline**:
   - Open DevTools → Network tab
   - Check "Offline" checkbox
   - Navigate around the app
   - Should show cached content and offline.html

## Security & Best Practices

### Authentication & Tokens
- ✅ API cache strategy is `NetworkFirst` (always tries fresh data first)
- ✅ Auth tokens are NOT cached (API calls with auth headers get fresh responses)
- ✅ Cache only stores successful responses (status 0 or 200)
- ✅ Short cache duration (5 minutes) for API responses

### HTTPS Requirement
- ⚠️ **PWA only works on HTTPS in production**
- ⚠️ Service Workers require secure context (HTTPS or localhost)
- ⚠️ Ensure your deployment platform (Coolify) uses HTTPS

### Development vs Production
- Development: Service Worker is **disabled** to avoid caching conflicts
- Production: Service Worker is **enabled** with auto-update strategy
- Use `npm run build` + HTTPS server to test PWA features

## No Breaking Changes for Desktop

### Desktop Compatibility
- ✅ All desktop features work unchanged
- ✅ PWA components are non-intrusive (small banners)
- ✅ Users can dismiss install prompts
- ✅ Desktop users can choose to install or use in browser
- ✅ No changes to existing routes or navigation

### Responsive Design
- ✅ Install prompt is responsive (adapts to mobile/tablet/desktop)
- ✅ Update notification positioned at top right on desktop
- ✅ All existing responsive layouts preserved

## Build & Deployment

### Local Development
```bash
npm install
npm run dev
# PWA features disabled in dev mode
```

### Production Build
```bash
npm install
npm run build
# Output in dist/ folder
# Includes: index.html, manifest.webmanifest, sw.js, icons, offline.html
```

### Deployment Checklist
1. ✅ Build production bundle: `npm run build`
2. ✅ Ensure HTTPS is enabled on server
3. ✅ Deploy `dist/` folder contents to web root
4. ✅ Verify manifest.webmanifest is accessible
5. ✅ Verify icons are accessible (test /icon-192x192.png)
6. ✅ Verify offline.html is accessible
7. ✅ Test in Chrome DevTools (Application → Manifest)
8. ✅ Test on real mobile device (Android/iOS)

### Coolify Deployment
- ✅ No special configuration needed
- ✅ Standard static build output
- ✅ Ensure HTTPS is configured in Coolify
- ✅ Set correct domain in Coolify settings
- ✅ No environment variables needed for PWA

## Troubleshooting

### Install Prompt Not Showing
- Check HTTPS is enabled
- Check browser console for errors
- Clear browser cache and reload
- Verify manifest.webmanifest is accessible
- Check user hasn't dismissed prompt (check localStorage)

### Service Worker Not Registering
- Must be on HTTPS (or localhost)
- Check browser console for errors
- Verify sw.js is accessible
- Clear browser data and try again

### Offline Mode Not Working
- Check service worker is registered (DevTools → Application)
- Verify cache storage has entries
- Check Workbox configuration in vite.config.ts
- Test with Chrome DevTools offline mode first

### Update Not Showing
- Service worker must detect new version
- Try hard refresh (Ctrl+Shift+R)
- Check for service worker update in DevTools
- Verify new build has different content

## Support
For issues or questions, contact the development team or refer to:
- [vite-plugin-pwa documentation](https://vite-pwa-org.netlify.app/)
- [Workbox documentation](https://developer.chrome.com/docs/workbox/)
- [PWA documentation](https://web.dev/progressive-web-apps/)
