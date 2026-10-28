import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { toUtcMinus3Iso } from '../src/lib/time.js';

describe('toUtcMinus3Iso', () => {
  test('formats as ISO 8601 with a -03:00 offset', () => {
    assert.equal(toUtcMinus3Iso(new Date('2026-10-26T14:30:00.123Z')), '2026-10-26T11:30:00.123-03:00');
  });

  test('represents the same instant as the input', () => {
    const date = new Date('2026-01-01T01:15:00.000Z');
    const result = toUtcMinus3Iso(date);
    assert.equal(result, '2025-12-31T22:15:00.000-03:00');
    assert.equal(new Date(result).getTime(), date.getTime());
  });
});
