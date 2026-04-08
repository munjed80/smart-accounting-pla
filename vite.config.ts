import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-swc";
import { defineConfig, PluginOption } from "vite";
import { execSync } from 'child_process'

import sparkPlugin from "@github/spark/spark-vite-plugin";
import createIconImportProxy from "@github/spark/vitePhosphorIconProxyPlugin";
import { resolve } from 'path'

const projectRoot = process.env.PROJECT_ROOT || import.meta.dirname

// Get git commit hash
let gitCommit = 'dev'
try {
  gitCommit = execSync('git rev-parse --short HEAD').toString().trim()
} catch {
  // Git not available or not a git repo
}

// Build timestamp
const buildTimestamp = new Date().toISOString()

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  define: {
    'import.meta.env.VITE_BUILD_TIMESTAMP': JSON.stringify(buildTimestamp),
    'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(gitCommit),
  },
  plugins: [
    react(),
    tailwindcss(),
    // DO NOT REMOVE
    createIconImportProxy() as PluginOption,
    sparkPlugin() as PluginOption,
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src')
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor: Radix UI components
          if (id.includes('@radix-ui')) {
            return 'vendor-radix'
          }
          // Vendor: Recharts + D3 (charting)
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'vendor-charts'
          }
          // Vendor: React core
          if (id.includes('react-dom') || (id.includes('/react/') && id.includes('node_modules'))) {
            return 'vendor-react'
          }
          // Vendor: TanStack React Query
          if (id.includes('@tanstack')) {
            return 'vendor-tanstack'
          }
          // Vendor: date-fns
          if (id.includes('date-fns')) {
            return 'vendor-date-fns'
          }
        },
      },
    },
  },
});
