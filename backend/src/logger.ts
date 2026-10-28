// Minimal JSON logger (one line per event) with no dependencies. On Vercel each line shows up
// as a structured entry in the function logs.
export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

type Writer = (line: string) => void;

export function createLogger(
  write: Writer = (line) => console.log(line),
  writeError: Writer = (line) => console.error(line),
): Logger {
  const emit =
    (level: 'info' | 'error', out: Writer) =>
    (message: string, fields: Record<string, unknown> = {}) =>
      out(JSON.stringify({ level, time: new Date().toISOString(), message, ...fields }));

  return { info: emit('info', write), error: emit('error', writeError) };
}

/** Discards everything (default for tests and for apps built without a logger). */
export const silentLogger: Logger = {
  info: () => {},
  error: () => {},
};

/** Serializable description of an unknown error for the logs (never sent to clients). */
export function describeError(error: unknown): Record<string, unknown> | string {
  return error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error);
}
