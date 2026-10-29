export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Human-readable message for anything a request (or other async work) may throw. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
