import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import base, { E2E_BACKEND_ENV, E2E_HOST } from './playwright.config';

// Same specs as playwright.config.ts, against the production build served like Vercel does:
// static files + vercel.json security headers (`vite preview`) and /api proxied to the compiled backend.
const API_PORT = 3200;
const WEB_URL = `http://${E2E_HOST}:4173`;

export default defineConfig({
  ...base,
  // Its own folder: Playwright empties the output folder on start, and sharing it would wipe
  // the traces of a failed development run.
  outputDir: 'test-results-prod',
  use: { ...base.use, baseURL: WEB_URL },
  webServer: {
    command: 'npm run build && npm run preview',
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    // Through the preview proxy, so it only succeeds once both the frontend and the API are up.
    url: `${WEB_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...E2E_BACKEND_ENV,
      PORT: String(API_PORT),
      PREVIEW_API_URL: `http://${E2E_HOST}:${API_PORT}`,
      E2E_HOST,
    },
  },
});
