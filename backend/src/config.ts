import { z } from 'zod';

/** Treats empty variables (e.g. `DATABASE_URL=` in a .env file) as unset. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const OriginListSchema = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1))
  // Normalizes to "protocol://host:port" (no trailing slash or path) to match the Origin header.
  .transform((urls) => urls.map((url) => new URL(url).origin));

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  // 0 lets the OS pick a free port (useful for tests).
  PORT: z.coerce.number().int().min(0).max(65_535).default(3000),
  DATABASE_URL: z.preprocess(emptyAsUndefined, z.url({ protocol: /^postgres(ql)?$/ }).optional()),
  PGLITE_DIR: z.preprocess(emptyAsUndefined, z.string().min(1).default('./data/pglite')),
  FRONTEND_URL: z.preprocess(emptyAsUndefined, OriginListSchema.default(['http://localhost:5173'])),
  RATE_LIMIT_WRITES_PER_MINUTE: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_READS_PER_MINUTE: z.coerce.number().int().positive().default(120),
});

export interface Config {
  port: number;
  /** PostgreSQL connection string (Neon in production). Without it, a local PGlite database is used. */
  databaseUrl?: string;
  /** PGlite data directory for local development; `memory://` for an ephemeral database. */
  pgliteDir: string;
  /** Frontend origins allowed by CORS (only needed when the frontend runs on another origin, e.g. Vite dev). */
  frontendUrls: string[];
  /** Max match creations/updates per client IP per minute. */
  writeLimitPerMinute: number;
  /** Max reads per client IP per minute (per server instance). */
  readLimitPerMinute: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }

  const {
    NODE_ENV,
    PORT,
    DATABASE_URL,
    PGLITE_DIR,
    FRONTEND_URL,
    RATE_LIMIT_WRITES_PER_MINUTE,
    RATE_LIMIT_READS_PER_MINUTE,
  } = result.data;
  if (NODE_ENV === 'production' && !DATABASE_URL) {
    throw new Error('DATABASE_URL is required in production (e.g. your Neon connection string).');
  }

  return {
    port: PORT,
    ...(DATABASE_URL ? { databaseUrl: DATABASE_URL } : {}),
    pgliteDir: PGLITE_DIR,
    frontendUrls: FRONTEND_URL,
    writeLimitPerMinute: RATE_LIMIT_WRITES_PER_MINUTE,
    readLimitPerMinute: RATE_LIMIT_READS_PER_MINUTE,
  };
}
