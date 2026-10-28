import type { RequestHandler } from 'express';
import type { Logger } from '../logger.js';

/** Logs one line per request when it finishes (no query string, body or IP: nothing personal). */
export const requestLogger =
  (logger: Logger): RequestHandler =>
  (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      logger.info('request', {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(Number(process.hrtime.bigint() - start) / 1e4) / 100,
      });
    });
    next();
  };
