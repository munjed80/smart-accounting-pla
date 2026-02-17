import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, PluginOption } from "vite";
import { VitePWA } from 'vite-plugin-pwa';

import sparkPlugin from "@github/spark/spark-vite-plugin";
import createIconImportProxy from "@github/spark/vitePhosphorIconProxyPlugin";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname
const appVersion = process.env.npm_package_version || '1'

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  plugins: [
    react(),
    tailwindcss(),
    // DO NOT REMOVE
    createIconImportProxy() as PluginOption,
    sparkPlugin() as PluginOption,
    VitePWA({
      registerType: 'autoUpdate',
      manifestFilename: 'manifest.webmanifest',
      devOptions: {
        enabled: false, // Disable SW in development to avoid conflicts
      },
      manifest: {
        name: 'Smart Accounting Platform',
        short_name: 'Smart Accounting',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0F172A',
        background_color: '#0F172A',
        description: 'Professioneel boekhoudplatform voor ZZP\'ers en accountants',
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-192x192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icon-512x512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Cache navigation requests (app shell)
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/auth/],
        
        // Include offline fallback page in precache
        additionalManifestEntries: [
          { url: '/offline.html', revision: appVersion }
        ],
        
        // Runtime caching strategies
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: `navigation-${appVersion}`,
              networkTimeoutSeconds: 5,
              precacheFallback: {
                fallbackURL: '/offline.html',
              },
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
          {
            // Cache app shell and static assets
            urlPattern: ({ request, url }) =>
              request.method === 'GET' &&
              ['script', 'style', 'font'].includes(request.destination) &&
              url.origin === self.location.origin,
            handler: 'CacheFirst',
            options: {
              cacheName: `static-resources-${appVersion}`,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // NetworkFirst for public GET API calls only
            // Skip authenticated requests entirely
            urlPattern: ({ request, url }) => {
              if (request.method !== 'GET') return false
              if (!url.pathname.startsWith('/api/')) return false

              const hasAuthHeader = request.headers.has('authorization')
              const isAuthEndpoint = /^\/api\/(auth|login|logout|token|session)/.test(url.pathname)
              return !hasAuthHeader && !isAuthEndpoint
            },
            handler: 'NetworkFirst',
            options: {
              cacheName: `public-api-cache-${appVersion}`,
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5, // 5 minutes
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Cache images
            urlPattern: ({ request, url }) =>
              request.method === 'GET' &&
              request.destination === 'image' &&
              url.origin === self.location.origin,
            handler: 'CacheFirst',
            options: {
              cacheName: `images-${appVersion}`,
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
    }) as PluginOption,
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
});
