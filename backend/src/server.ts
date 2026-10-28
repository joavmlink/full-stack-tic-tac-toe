import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { bootstrap } from './bootstrap.js';
import type { Config } from './config.js';
import type { Database } from './db/database.js';
import type { Logger } from './logger.js';

export interface RunningServer {
  server: Server;
  database: Database;
  port: number;
  /** Stops accepting connections, waits for active ones and closes the database. */
  close: () => Promise<void>;
}

export async function startServer(config: Config, logger: Logger): Promise<RunningServer> {
  const { app, database } = await bootstrap(config, logger);

  const server = await new Promise<Server>((resolve, reject) => {
    const s = app.listen(config.port, (error) => (error ? reject(error) : resolve(s)));
  }).catch(async (error: unknown) => {
    await database.close();
    throw error;
  });

  const { port } = server.address() as AddressInfo;
  logger.info('server started', {
    url: `http://localhost:${port}/api`,
    database: database.description,
    corsOrigins: config.frontendUrls,
  });

  let closing: Promise<void> | undefined;
  const close = () => {
    closing ??= new Promise<void>((resolve, reject) => {
      server.close((error) => {
        database.close().then(() => (error ? reject(error) : resolve()), reject);
      });
      // Idle keep-alive connections would otherwise keep the server open.
      server.closeIdleConnections();
    });
    return closing;
  };

  return { server, database, port, close };
}
