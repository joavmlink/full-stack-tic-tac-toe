// Vercel Function: the whole Express API, compiled by `npm run build` into backend/dist.
// vercel.json rewrites every /api/* request here.
export { default } from '../backend/dist/vercel.js';
