import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { createTestDatabase, FRONTEND_URL, startTestServer, type TestDatabase, type TestServer } from './helpers.js';

describe('CORS', () => {
  let database: TestDatabase;
  let server: TestServer;

  before(async () => {
    database = await createTestDatabase();
  });

  after(async () => {
    await database.close();
  });

  beforeEach(async () => {
    server = await startTestServer(database);
  });

  afterEach(async () => {
    await server.close();
  });

  const preflight = (origin: string, method: string) =>
    fetch(`${server.baseUrl}/api/matches/1`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'content-type, authorization',
      },
    });

  test('the preflight from the frontend allows the origin, methods, Content-Type and Authorization', async () => {
    const res = await preflight(FRONTEND_URL, 'PATCH');
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), FRONTEND_URL);
    assert.equal(res.headers.get('access-control-allow-methods'), 'GET,POST,PATCH');
    assert.equal(res.headers.get('access-control-allow-headers'), 'Content-Type,Authorization');
  });

  test('responses to the frontend include Access-Control-Allow-Origin', async () => {
    const res = await fetch(`${server.baseUrl}/api/matches`, { headers: { Origin: FRONTEND_URL } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), FRONTEND_URL);
    assert.match(res.headers.get('vary') ?? '', /Origin/);
    // The frontend reads the pagination header from another origin during development.
    assert.equal(res.headers.get('access-control-expose-headers'), 'Link');
  });

  for (const origin of ['http://evil.com', 'http://localhost:5174', 'https://localhost:5173']) {
    test(`does not allow other origins (${origin})`, async () => {
      const pre = await preflight(origin, 'POST');
      assert.equal(pre.headers.get('access-control-allow-origin'), null);

      const res = await fetch(`${server.baseUrl}/api/matches`, { headers: { Origin: origin } });
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  }
});
