const UTC_MINUS_3_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * Formats a date as ISO 8601 in standard time UTC-3 (Argentina, no daylight saving time).
 * E.g. "2026-10-26T11:30:00.123-03:00". It represents the same instant as the input.
 */
export function toUtcMinus3Iso(date: Date): string {
  return new Date(date.getTime() - UTC_MINUS_3_OFFSET_MS).toISOString().replace('Z', '-03:00');
}
