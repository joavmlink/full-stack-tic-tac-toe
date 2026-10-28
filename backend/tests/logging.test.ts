import assert from 'node:assert/strict';
import { after, afterEach, before, describe, test } from 'node:test';
import { createLogger, describeError, silentLogger } from '../src/logger.js';
import {
  captureLogger,
  createTestDatabase,
  startTestServer,
  type TestDatabase,
  type TestServer,
} from './helpers.js';

describe('createLogger', () => {
  test('writes one JSON line per event with level, time, message and fields', () => {
    const out: string[] = [];
    const err: string[] = [];
    const logger = createLogger(
      (line) => out.push(line),
      (line) => err.push(line),
    );

    logger.info('server started', { port: 3000 });
    logger.error('request failed', { status: 500 });

    assert.equal(out.length, 1);
    assert.equal(err.length, 1);
    const info = JSON.parse(out[0]!) as Record<string, unknown>;
    assert.equal(info.level, 'info');
    assert.equal(info.message, 'server started');
    assert.equal(info.port, 3000);
    assert.ok(!Number.isNaN(Date.parse(String(info.time))));
    assert.equal((JSON.parse(err[0]!) as Record<string, unknown>).level, 'error');
  });

  test('silentLogger discards everything', () => {
    assert.doesNotThrow(() => {
      silentLogger.info('x');
      silentLogger.error('y', { z: 1 });
    });
  });

  test('describeError keeps name, message and stack of errors', () => {
    const described = describeError(new TypeError('bad')) as Record<string, unknown>;
    assert.equal(described.name, 'TypeError');
    assert.equal(described.message, 'bad');
    assert.match(String(described.stack), /TypeError: bad/);
    assert.equal(describeError('plain'), 'plain');
  });
});

describe('Request logging', () => {
  let database: TestDatabase;
  let server: TestServer;
  const logger = captureLogger();

  before(async () => {
    database = await createTestDatabase();
    server = await startTestServer(database, { logger });
  });

  after(async () => {
    await server.close();
    await database.close();
  });

  afterEach(() => {
    logger.entries.length = 0;
  });

  /** Waits for the "finish" event, which fires right after the response is sent. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

  test('logs method, path without the query string, status and duration', async () => {
    await fetch(`${server.baseUrl}/api/matches?limit=5&before=10`);
    await settle();
    const [entry] = logger.entries;
    assert.equal(entry?.message, 'request');
    assert.equal(entry?.fields.method, 'GET');
    assert.equal(entry?.fields.path, '/api/matches');
    assert.equal(entry?.fields.status, 200);
    assert.equal(typeof entry?.fields.durationMs, 'number');
  });

  test('client errors are logged as requests, not as errors', async () => {
    await fetch(`${server.baseUrl}/api/matches/999`);
    await settle();
    assert.equal(logger.entries[0]?.fields.status, 404);
    assert.equal(logger.errors().length, 0);
  });

  test('request logs never include IPs, bodies or headers', async () => {
    await fetch(`${server.baseUrl}/api/matches`, { method: 'POST', headers: { 'X-Forwarded-For': '203.0.113.9' } });
    await settle();
    assert.deepEqual(Object.keys(logger.entries[0]!.fields).sort(), ['durationMs', 'method', 'path', 'status']);
  });
});
