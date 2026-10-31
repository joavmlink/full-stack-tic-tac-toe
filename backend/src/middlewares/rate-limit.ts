import type { Request } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { Pool } from '../db/pool.js';
import { AppError } from '../errors.js';
import { sha256Hex } from '../lib/hash.js';
import { PostgresRateLimitStore } from '../models/rate-limit-store.js';

const READ_METHODS = new Set(['GET', 'HEAD']);
const isRead = (req: Request) => READ_METHODS.has(req.method);

// Clients are identified by a SHA-256 hash of their IP (IPv6 grouped by /56 subnet),
// so raw IP addresses are never stored.
const clientKey = (req: Request) => sha256Hex(ipKeyGenerator(req.ip ?? 'unknown'));

const shared = {
  windowMs: 60_000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: clientKey,
  handler: (_req: Request, _res: unknown, next: (error: unknown) => void) => {
    next(new AppError(429, 'RATE_LIMITED', 'Too many requests, please try again in a minute'));
  },
} as const;

/**
 * Limits match creations/updates per client per minute so nobody can flood the database.
 * Counters live in PostgreSQL, so the limit is shared by every server instance.
 */
export function createWriteLimiter(pool: Pool, limitPerMinute: number) {
  return rateLimit({
    ...shared,
    limit: limitPerMinute,
    store: new PostgresRateLimitStore(pool),
    skip: (req) => isRead(req) || req.method === 'OPTIONS',
  });
}

/**
 * Limits reads per client per minute. Counters are kept in memory per server instance on
 * purpose: checking them costs nothing, so a flood of reads never adds load to the database
 * (the resource being protected). Vercel's firewall can add a global limit at the edge.
 */
export function createReadLimiter(limitPerMinute: number) {
  return rateLimit({
    ...shared,
    limit: limitPerMinute,
    skip: (req) => !isRead(req),
  });
}
