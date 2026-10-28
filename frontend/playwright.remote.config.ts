import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Smoke test against a deployed app, e.g.:
//   E2E_BASE_URL=https://your-app.vercel.app npm run test:e2e:remote -w frontend
// It plays one match, so it adds one row to that database.
const baseURL = process.env.E2E_BASE_URL;
if (!baseURL) throw new Error('Set E2E_BASE_URL to the deployed URL (e.g. https://your-app.vercel.app).');

export default defineConfig({
  ...base,
  testMatch: 'smoke.spec.ts',
  retries: 1,
  use: { ...base.use, baseURL },
  webServer: undefined,
});
