import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import type { Pool } from '../db/pool.js';

interface HitsRow {
  hits: number;
  reset_at: Date;
}

// Starts a new window when the previous one expired; otherwise adds a hit to the current one.
const INCREMENT_SQL = `
  INSERT INTO rate_limit_hits (key, hits, reset_at)
  VALUES ($1, 1, now() + $2 * interval '1 millisecond')
  ON CONFLICT (key) DO UPDATE SET
    hits     = CASE WHEN rate_limit_hits.reset_at <= now() THEN 1 ELSE rate_limit_hits.hits + 1 END,
    reset_at = CASE WHEN rate_limit_hits.reset_at <= now() THEN EXCLUDED.reset_at ELSE rate_limit_hits.reset_at END
  RETURNING hits, reset_at
`;

/** Probability of purging expired rows on each increment (keeps the table small). */
const CLEANUP_PROBABILITY = 0.01;

/**
 * express-rate-limit store backed by PostgreSQL. Unlike the default in-memory store,
 * the counters are shared by every server instance (each Vercel Function instance).
 */
export class PostgresRateLimitStore implements Store {
  readonly prefix: string;
  readonly localKeys = false;
  private readonly pool: Pool;
  private windowMs = 60_000;

  constructor(pool: Pool, prefix = 'writes:') {
    this.pool = pool;
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const { rows } = await this.pool.query<HitsRow>(INCREMENT_SQL, [this.prefix + key, this.windowMs]);
    if (Math.random() < CLEANUP_PROBABILITY) {
      this.pool.query('DELETE FROM rate_limit_hits WHERE reset_at <= now()').catch(() => {});
    }
    const row = rows[0]!;
    return { totalHits: row.hits, resetTime: row.reset_at };
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const { rows } = await this.pool.query<HitsRow>(
      'SELECT hits, reset_at FROM rate_limit_hits WHERE key = $1 AND reset_at > now()',
      [this.prefix + key],
    );
    return rows[0] ? { totalHits: rows[0].hits, resetTime: rows[0].reset_at } : undefined;
  }

  async decrement(key: string): Promise<void> {
    await this.pool.query('UPDATE rate_limit_hits SET hits = GREATEST(hits - 1, 0) WHERE key = $1', [
      this.prefix + key,
    ]);
  }

  async resetKey(key: string): Promise<void> {
    await this.pool.query('DELETE FROM rate_limit_hits WHERE key = $1', [this.prefix + key]);
  }
}
