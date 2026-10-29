// Entry point of the local / long-running server (npm run dev, npm start).
// In production on Vercel the app runs as a function instead (see vercel.ts).
import { loadConfig } from './config.js';
import { createLogger, describeError } from './logger.js';
import { startServer } from './server.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;
const logger = createLogger();

try {
  const running = await startServer(loadConfig(), logger);

  let shuttingDown = false;
  const shutdown = (reason: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('shutting down', { reason });

    setTimeout(() => {
      logger.error('shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    running.close().then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error('shutdown failed', { error: describeError(error) });
        process.exit(1);
      },
    );
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', { error: describeError(reason) });
    shutdown('unhandledRejection');
  });
} catch (error) {
  // Invalid configuration, port already in use, database unreachable...
  logger.error('startup failed', { error: describeError(error) });
  process.exit(1);
}
