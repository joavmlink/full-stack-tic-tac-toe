import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors.js';
import { describeError, type Logger } from '../logger.js';

export interface HttpError {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  headers?: Record<string, string>;
}

interface ErrorLike {
  status?: unknown;
  statusCode?: unknown;
  type?: unknown;
  code?: unknown;
  message?: unknown;
}

// Errors thrown by Express' body parser (body-parser / raw-body), by `type`.
const PARSER_ERRORS: Record<string, Omit<HttpError, 'details' | 'headers'>> = {
  'entity.parse.failed': { status: 400, code: 'INVALID_JSON', message: 'The request body is not valid JSON' },
  'entity.too.large': { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large' },
  'encoding.unsupported': { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported content encoding' },
  'charset.unsupported': { status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Unsupported charset' },
  'request.aborted': { status: 400, code: 'BAD_REQUEST', message: 'Bad request' },
  'request.size.invalid': { status: 400, code: 'BAD_REQUEST', message: 'Bad request' },
};

// Network errors and PostgreSQL SQLSTATEs meaning "the database can't be reached right now":
// too_many_connections, admin/crash shutdown, cannot_connect_now (+ class 08, connection exceptions).
const DATABASE_UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);
const DATABASE_UNAVAILABLE_MESSAGE = /timeout exceeded when trying to connect|Connection terminated|Query read timeout/i;

function isDatabaseUnavailable(error: ErrorLike): boolean {
  const { code, message } = error;
  if (typeof code === 'string' && (DATABASE_UNAVAILABLE_CODES.has(code) || /^08[0-9A-Z]{3}$/.test(code))) {
    return true;
  }
  return typeof message === 'string' && DATABASE_UNAVAILABLE_MESSAGE.test(message);
}

/** Translates any error into a safe HTTP error. Messages never include internal details. */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof AppError) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
      ...(error.headers ? { headers: error.headers } : {}),
    };
  }

  const err = (typeof error === 'object' && error !== null ? error : {}) as ErrorLike;

  const parserError = typeof err.type === 'string' ? PARSER_ERRORS[err.type] : undefined;
  if (parserError) return { ...parserError };

  // Other 4xx errors from Express / http-errors (e.g. a malformed URL).
  const clientStatus = err.status ?? err.statusCode;
  if (typeof clientStatus === 'number' && clientStatus >= 400 && clientStatus < 500) {
    return { status: clientStatus, code: 'BAD_REQUEST', message: 'Bad request' };
  }

  if (error instanceof Error && isDatabaseUnavailable(err)) {
    return {
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'The service is temporarily unavailable, please try again shortly',
      headers: { 'Retry-After': '5' },
    };
  }

  return { status: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} does not exist`));
};

// Internal details (stack traces, SQL errors) are logged, never sent to the client.
export const createErrorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (error: unknown, req, res, next) => {
    const { status, code, message, details, headers } = toHttpError(error);

    if (status >= 500) {
      logger.error('request failed', {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status,
        code,
        error: describeError(error),
      });
    }

    if (res.headersSent) {
      next(error);
      return;
    }
    if (headers) res.set(headers);
    res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}) } });
  };
