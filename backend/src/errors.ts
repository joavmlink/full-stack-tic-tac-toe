// Application error with an HTTP status, a stable machine-readable code and a message that is
// safe to show to clients. The response body is always { error: { code, message, details? } }.
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    options: { details?: unknown; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options.details;
    this.headers = options.headers;
  }
}

export const matchNotFound = (id: number) => new AppError(404, 'MATCH_NOT_FOUND', `Match ${id} does not exist`);

export const matchTokenInvalid = () =>
  new AppError(403, 'MATCH_TOKEN_INVALID', 'The token is not valid for this match');

export const invalidRequest = (details: unknown) =>
  new AppError(400, 'VALIDATION_ERROR', 'The request data is invalid', { details });
