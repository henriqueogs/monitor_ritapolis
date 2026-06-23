'use strict';

const { defineConfig, devices } = require('@playwright/test');

// E2E (caminho feliz). Reaproveita os servidores locais se já estiverem no ar
// (API 3001 + Next 3000); senão, sobe ambos.
module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 7000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/api.js',
      port: 3001,
      reuseExistingServer: true,
      timeout: 60000,
    },
    {
      command: 'npm run dev --prefix frontend',
      port: 3000,
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});
