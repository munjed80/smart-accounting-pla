# PWA Features - Visual Guide

## Install Prompt (Android/Desktop)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   [Download Icon]  Installeer app                      │
│                    Snellere toegang en offline werken   │
│                                                         │
│                    [Installeer] [X]                     │
└─────────────────────────────────────────────────────────┘
```

**Location**: Bottom-right corner (desktop), full-width on mobile
**Behavior**: 
- Appears when `beforeinstallprompt` event fires
- Dismissible (saves to localStorage)
- Click "Installeer" to add app to home screen

---

## Install Instructions (iOS)

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│   [Phone Icon]  Installeer de app op iOS:              │
│                                                         │
│                 1. Tik op het Deel-icoon ⎋             │
│                 2. Scroll naar beneden en tik op        │
│                    "Zet op beginscherm"                 │
│                 3. Tik op "Voeg toe"                    │
│                                                         │
│                                              [X]        │
└─────────────────────────────────────────────────────────┘
```

**Location**: Bottom-right corner (desktop), full-width on mobile
**Trigger**: Automatically shown on iOS devices when install prompt not available
**Behavior**: Dismissible, guides users through manual installation

---

## Update Notification

```
┌─────────────────────────────────────────────────────────┐
│   [Refresh Icon]  Nieuwe versie beschikbaar            │
│                    Klik op herladen om bij te werken    │
│                                              [Herladen] [X] │
└─────────────────────────────────────────────────────────┘
```

**Location**: Top-right corner
**Trigger**: When new service worker version is detected
**Behavior**: 
- Click "Herladen" to activate new version
- Dismissible
- Auto-reload on click

---

## Offline Fallback Page

When users navigate offline to an uncached page, they see:

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                    [Database Icon]                      │
│                                                         │
│              Geen internetverbinding                    │
│                                                         │
│         U bent momenteel offline. Controleer uw         │
│         internetverbinding en probeer het opnieuw.      │
│                                                         │
│                  [Opnieuw proberen]                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Features**:
- Dark theme matching app design
- Database icon (same as app icon)
- Friendly Dutch message
- Retry button (reloads page)
- Fully self-contained (no external dependencies)

---

## App Icon Design

The app uses a database icon in the brand's color scheme:

```
   ┌─────────────────┐
   │                 │
   │   ╔═══════╗     │
   │   ║ ─── ──║     │  Database icon
   │   ║ ─── ──║     │  with duotone effect
   │   ║ ─── ──║     │  
   │   ╚═══════╝     │  Colors:
   │                 │  - Background: #0F172A
   └─────────────────┘  - Icon: #60A5FA
```

**Variants**:
- 192x192 - Standard icon
- 512x512 - High-resolution icon
- 192x192 maskable - Adaptive icon for Android
- 512x512 maskable - High-res adaptive for Android

---

## User Experience Flow

### First Visit (Mobile)
1. User opens app in browser
2. App loads normally
3. Install prompt appears (Android) or instructions shown (iOS)
4. User can install or dismiss

### Installed App
1. User taps app icon on home screen
2. App opens in fullscreen (no browser UI)
3. Theme color matches status bar
4. Fast loading (cached assets)

### Offline Mode
1. User loses internet connection
2. Previously visited pages still work (cached)
3. Uncached pages show offline fallback
4. API calls fall back to 5-minute cache

### App Update
1. New version deployed
2. Service worker detects update
3. "Nieuwe versie beschikbaar" banner appears
4. User clicks "Herladen"
5. New version activated

---

## Design System Integration

All PWA components use the existing design system:
- ✅ shadcn/ui components (Alert, Button, Badge)
- ✅ Phosphor icons (matching app style)
- ✅ Tailwind CSS classes
- ✅ Dark/light theme support
- ✅ Responsive design
- ✅ Dutch translations

---

## Accessibility

- ✅ Keyboard navigation (Tab, Enter, Escape)
- ✅ Screen reader friendly
- ✅ ARIA labels on buttons
- ✅ Semantic HTML
- ✅ Focus indicators
- ✅ High contrast support

---

## Browser Compatibility

| Browser | Install | Offline | Updates |
|---------|---------|---------|---------|
| Chrome Android | ✅ Auto | ✅ Full | ✅ Notification |
| Safari iOS | 📱 Manual | ✅ Full | ⚠️ On relaunch |
| Chrome Desktop | ✅ Auto | ✅ Full | ✅ Notification |
| Edge Desktop | ✅ Auto | ✅ Full | ✅ Notification |
| Firefox | ⚠️ Limited | ✅ Full | ⚠️ Limited |
| Safari Desktop | ⚠️ Limited | ✅ Full | ⚠️ Limited |

Legend:
- ✅ Full support
- ⚠️ Limited support
- 📱 Manual installation required

---

## Performance Metrics

### First Load
- HTML: Cached after first visit
- Assets: Cached (CacheFirst, 30 days)
- API: Fresh data (NetworkFirst)

### Subsequent Loads
- HTML: Instant (from cache)
- Assets: Instant (from cache)
- API: Fresh or 5-minute cache

### Offline
- HTML: Instant (from cache)
- Assets: Instant (from cache)
- API: 5-minute cache or error
- Uncached: Offline fallback page

### Cache Sizes
- App Shell: ~500 KB
- Static Assets: ~2 MB (max 100 entries)
- API Cache: ~5 MB (max 50 entries)
- Images: ~10 MB (max 60 entries)

---

## Testing Checklist

### Android (Chrome)
- [ ] Install prompt appears
- [ ] App installs to home screen
- [ ] Opens in fullscreen
- [ ] Offline mode works
- [ ] Update notification appears

### iOS (Safari)
- [ ] Installation instructions appear
- [ ] Manual install works
- [ ] Opens in fullscreen
- [ ] Offline mode works
- [ ] Status bar theme correct

### Desktop (Chrome/Edge)
- [ ] Install icon in address bar
- [ ] Desktop app installs
- [ ] Window opens standalone
- [ ] Offline mode works
- [ ] Update notification appears

### All Platforms
- [ ] Offline fallback page shows
- [ ] API cache works (5 min)
- [ ] Icons display correctly
- [ ] Theme colors match
- [ ] No breaking changes

---

## Next Steps

After deployment:
1. Monitor service worker registration rate
2. Track installation rate (analytics)
3. Collect user feedback
4. Consider push notifications (future)
5. Consider background sync (future)

For immediate deployment, see `PWA_FINAL_SUMMARY.md`.
