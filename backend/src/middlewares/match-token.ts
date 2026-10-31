import type { RequestHandler } from 'express';
import { AppError } from '../errors.js';
import { hashMatchToken } from '../lib/match-token.js';

declare global {
  namespace Express {
    interface Locals {
      /** Hash of the Bearer token sent with the request; set by requireMatchToken. */
      matchTokenHash?: string;
    }
  }
}

/**
 * Requires a Bearer credential (`Authorization: Bearer <token>`) and leaves its hash in
 * `res.locals.matchTokenHash`. It runs before the JSON and body validation middlewares, so a
 * request without credentials gets 401 rather than a validation error. It doesn't check the
 * token's format: any value other than the issued token simply won't match the stored hash.
 */
export const requireMatchToken: RequestHandler = (req, res, next) => {
  const credential = /^Bearer\s+(\S+)\s*$/i.exec(req.get('Authorization') ?? '');
  if (!credential) {
    throw new AppError(401, 'MATCH_TOKEN_REQUIRED', 'Finishing a match requires its token', {
      headers: { 'WWW-Authenticate': 'Bearer' },
    });
  }
  res.locals.matchTokenHash = hashMatchToken(credential[1]!);
  next();
};
