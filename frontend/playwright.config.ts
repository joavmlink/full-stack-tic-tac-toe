import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// Dedicated ports so e2e never clashes with `npm run dev` (3000 / 5173).
const API_PORT = 3100;
const WEB_PORT = 5174;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}/api`;

/** Backend env shared by the e2e configs: in-memory PostgreSQL (PGlite) and no practical rate limits. */
export const E2E_BACKEND_ENV = {
  PGLITE_DIR: 'memory://',
  RATE_LIMIT_WRITES_PER_MINUTE: '10000',
  RATE_LIMIT_READS_PER_MINUTE: '100000',
};

export default defineConfig({
  testDir: './tests/e2e',
  // Every spec shares one backend: run them serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Real backend with CORS allowed only for the e2e frontend.
      command: 'node --import tsx src/index.ts',
      cwd: fileURLToPath(new URL('../backend', import.meta.url)),
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      env: { ...E2E_BACKEND_ENV, PORT: String(API_PORT), FRONTEND_URL: WEB_URL },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT}`,
      url: WEB_URL,
      reuseExistingServer: false,
      env: { VITE_API_URL: API_URL },
    },
  ],
});
