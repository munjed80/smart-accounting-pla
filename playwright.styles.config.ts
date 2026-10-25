import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/styles',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5000',
    screenshot: 'only-on-failure',
    launchOptions: process.env.CSS_BROWSER_EXECUTABLE_PATH ? {
      executablePath: process.env.CSS_BROWSER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-software-rasterizer', '--disable-gpu-compositing', '--use-gl=disabled', '--use-angle=disabled'],
    } : {},
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:5000/tests/styles/index.html',
    reuseExistingServer: false,
    timeout: 60000,
  },
})
