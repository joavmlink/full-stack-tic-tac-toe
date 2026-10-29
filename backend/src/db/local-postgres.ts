import fs from 'node:fs';
import path from 'node:path';

export interface LocalPostgres {
  connectionString: string;
  stop(): Promise<void>;
}

/**
 * Starts PGlite (PostgreSQL compiled to WASM, running inside Node) behind a Postgres
 * wire-protocol socket, so the app talks to it with the same `pg` driver used in production.
 * Development and tests only: the packages are dev dependencies and are imported lazily.
 */
export async function startLocalPostgres(dataDir: string): Promise<LocalPostgres> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');

  const inMemory = dataDir.startsWith('memory://');
  if (!inMemory) fs.mkdirSync(path.resolve(dataDir), { recursive: true });

  const db = await PGlite.create(inMemory ? 'memory://' : path.resolve(dataDir));
  // PGlite is a single-session database, so the pool uses one connection at a time (max: 1 in
  // database.ts).
  // The server accepts 2 so a replacement connection isn't rejected while the pool is still
  // closing a client it discarded after a query error.
  // Port 0 lets the OS assign a free port atomically (picking one first and binding it later
  // races with other processes, e.g. test files running in parallel).
  const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 2 });
  await server.start();
  const port = server.getServerConn().split(':').at(-1);

  return {
    connectionString: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}
