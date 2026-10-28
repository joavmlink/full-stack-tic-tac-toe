import fs from 'node:fs';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[];
}

// Security headers come from vercel.json, so `vite preview` serves exactly what Vercel serves.
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as VercelConfig;
const securityHeaders = Object.fromEntries(
  (vercel.headers.find((rule) => rule.source === '/(.*)')?.headers ?? []).map(({ key, value }) => [key, value]),
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // The backend allows one exact origin via CORS (FRONTEND_URL): never switch ports silently.
    strictPort: true,
  },
  // `vite preview` mimics Vercel locally: static build + /api proxied to the backend + same headers.
  preview: {
    port: 4173,
    strictPort: true,
    headers: securityHeaders,
    proxy: { '/api': process.env.PREVIEW_API_URL ?? 'http://localhost:3000' },
  },
});
