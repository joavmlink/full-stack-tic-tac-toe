import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError, invalidRequest } from '../errors.js';

const issuesOf = (error: z.ZodError) =>
  error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));

/** Parses request input (params, query) with a schema or throws a 400 with Zod's details. */
export function parseInput<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) throw invalidRequest(issuesOf(result.error));
  return result.data;
}

/** Validates req.body with a schema and replaces it with the parsed, normalized value. */
export const validateBody =
  <T extends z.ZodType>(schema: T): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(invalidRequest(issuesOf(result.error)));
      return;
    }
    req.body = result.data;
    next();
  };

/**
 * If the request declares a Content-Type and has a body, it must be JSON. Without a
 * Content-Type the body stays empty and validation answers 400 instead.
 */
export const requireJson: RequestHandler = (req, _res, next) => {
  // req.is returns null when there's no body and false when the type doesn't match.
  if (req.headers['content-type'] && req.is('application/json') === false) {
    next(new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'));
    return;
  }
  next();
};

/**
 * Last handler of a known route: any other method gets 405 plus the `Allow` header
 * (HEAD is implied by GET). Unknown routes still fall through to the 404 handler.
 */
export function methodNotAllowed(...allowed: string[]): RequestHandler {
  const allow = [...allowed, ...(allowed.includes('GET') ? ['HEAD'] : [])].join(', ');
  return (req, _res, next) => {
    next(
      new AppError(405, 'METHOD_NOT_ALLOWED', `Method ${req.method} is not allowed on ${req.originalUrl}`, {
        headers: { Allow: allow },
      }),
    );
  };
}
