import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadConfig } from '../src/config.js';

const NEON_URL = 'postgresql://app_user:not-a-real-password@ep-example-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require';

describe('loadConfig', () => {
  test('uses defaults (local PGlite, no DATABASE_URL)', () => {
    assert.deepEqual(loadConfig({}), {
      port: 3000,
      pgliteDir: './data/pglite',
      frontendUrls: ['http://localhost:5173'],
      writeLimitPerMinute: 30,
      readLimitPerMinute: 120,
    });
  });

  test('accepts postgres:// and postgresql:// URLs', () => {
    assert.equal(loadConfig({ DATABASE_URL: NEON_URL }).databaseUrl, NEON_URL);
    assert.equal(loadConfig({ DATABASE_URL: 'postgres://app_user:not-a-real-password@localhost:5432/db' }).databaseUrl, 'postgres://app_user:not-a-real-password@localhost:5432/db');
  });

  test('PORT=0 is valid (the OS picks a free port)', () => {
    assert.equal(loadConfig({ PORT: '0' }).port, 0);
  });

  test('treats empty variables as unset', () => {
    const config = loadConfig({ DATABASE_URL: '', PGLITE_DIR: '', FRONTEND_URL: '' });
    assert.equal(config.databaseUrl, undefined);
    assert.equal(config.pgliteDir, './data/pglite');
    assert.deepEqual(config.frontendUrls, ['http://localhost:5173']);
  });

  test('accepts several frontend origins and normalizes them', () => {
    const config = loadConfig({ FRONTEND_URL: 'http://localhost:5173/, https://tictactoe.example.com ' });
    assert.deepEqual(config.frontendUrls, ['http://localhost:5173', 'https://tictactoe.example.com']);
  });

  test('reads the rate limits', () => {
    const config = loadConfig({ RATE_LIMIT_WRITES_PER_MINUTE: '5', RATE_LIMIT_READS_PER_MINUTE: '50' });
    assert.equal(config.writeLimitPerMinute, 5);
    assert.equal(config.readLimitPerMinute, 50);
  });

  test('requires DATABASE_URL in production', () => {
    assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /DATABASE_URL is required in production/);
    assert.equal(loadConfig({ NODE_ENV: 'production', DATABASE_URL: NEON_URL }).databaseUrl, NEON_URL);
  });

  test('rejects invalid values', () => {
    for (const env of [
      { PORT: 'abc' },
      { PORT: '65536' },
      { DATABASE_URL: 'not-a-url' },
      { DATABASE_URL: 'mysql://u:p@localhost/db' },
      { FRONTEND_URL: 'not-a-url' },
      { RATE_LIMIT_WRITES_PER_MINUTE: '0' },
      { RATE_LIMIT_READS_PER_MINUTE: '-1' },
    ]) {
      assert.throws(() => loadConfig(env), /Invalid environment variables/, JSON.stringify(env));
    }
  });

  test('error messages never include the connection string', () => {
    try {
      loadConfig({ DATABASE_URL: 'mysql://app_user:not-a-real-password@host/db' });
      assert.fail('should have thrown');
    } catch (error) {
      assert.doesNotMatch((error as Error).message, /not-a-real-password/);
    }
  });
});
