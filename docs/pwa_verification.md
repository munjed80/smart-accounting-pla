# PWA Verification Guide

## Android install steps
1. Open the production URL in Chrome on Android.
2. Wait until the app shell fully loads and network calls settle.
3. Tap the install icon in the app header (download icon) after the browser emits `beforeinstallprompt`.
4. Confirm **Install** in the native prompt.
5. Launch the installed app from the home screen and verify it opens in standalone mode (no browser URL bar).

## iOS install steps
1. Open the production URL in Safari on iPhone/iPad.
2. Tap the Share button.
3. Choose **Add to Home Screen**.
4. Confirm the app name and tap **Add**.
5. Open the app from the home screen and verify standalone appearance.

## Offline test steps
1. Open the app once while online so the service worker can precache the shell and static assets.
2. Open browser devtools (Application > Service Workers) and confirm service worker is active.
3. Turn off network (Airplane mode or devtools offline mode).
4. Refresh the app:
   - Existing routed pages should render from cached shell.
   - Unavailable navigations should render `offline.html` fallback.
5. Verify API mutations (POST/PUT/DELETE) are not served from cache and fail fast while offline.

## Cache invalidation and update test steps
1. Deploy a new frontend version (new build hash / package version).
2. Load the app in an existing client session.
3. Verify the update banner appears when a new service worker is available.
4. Click **Herladen** in the update prompt and confirm updated assets are loaded.
5. In devtools, verify old caches are removed (`cleanupOutdatedCaches`) and only versioned cache names remain.
6. Validate that authenticated API calls are not present in runtime cache entries.
