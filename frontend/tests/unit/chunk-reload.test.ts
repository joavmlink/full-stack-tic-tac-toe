import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { shouldReloadAfterChunkError } from '../../src/lib/chunk-reload';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe('shouldReloadAfterChunkError', () => {
  test('reloads on the first chunk error', () => {
    assert.equal(shouldReloadAfterChunkError(memoryStorage(), 1_000_000), true);
  });

  test('does not reload again within 10 seconds (no reload loops)', () => {
    const storage = memoryStorage();
    assert.equal(shouldReloadAfterChunkError(storage, 1_000_000), true);
    assert.equal(shouldReloadAfterChunkError(storage, 1_009_999), false);
  });

  test('reloads again once 10 seconds have passed', () => {
    const storage = memoryStorage();
    assert.equal(shouldReloadAfterChunkError(storage, 1_000_000), true);
    assert.equal(shouldReloadAfterChunkError(storage, 1_010_000), true);
  });

  test('does not reload when storage is unavailable', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    };
    assert.equal(shouldReloadAfterChunkError(blocked, 1_000_000), false);
  });
});
