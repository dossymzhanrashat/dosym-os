import { defineConfig, devices } from '@playwright/test';

// Key flows in a real browser (SPEC › Tech stack: Playwright). Runs against the production build
// served by `vite preview`, in the installed Chrome (no browser download).
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: { baseURL: 'http://localhost:4173/dosym-os/', channel: 'chrome', ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173/dosym-os/', reuseExistingServer: true, timeout: 180_000 },
});
