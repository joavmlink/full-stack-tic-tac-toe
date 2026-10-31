import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import { AppError, invalidRequest, matchNotFound } from '../src/errors.js';
import { toHttpError } from '../src/middlewares/error-handler.js';
import {
  bearer,
  createTestDatabase,
  startTestServer,
  type ErrorBody,
  type TestDatabase,
  type TestServer,
} from './helpers.js';

describe('AppError and factories', () => {
  test('keeps status, code, details and headers', () => {
    const error = new AppError(429, 'RATE_LIMITED', 'Slow down', { details: ['x'], headers: { 'Retry-After': '1' } });
    assert.equal(error.name, 'AppError');
    assert.deepEqual(toHttpError(error), {
      status: 429,
      code: 'RATE_LIMITED',
      message: 'Slow down',
      details: ['x'],
      headers: { 'Retry-After': '1' },
    });
  });

  test('matchNotFound and invalidRequest', () => {
    assert.deepEqual(toHttpError(matchNotFound(7)), { status: 404, code: 'MATCH_NOT_FOUND', message: 'Match 7 does not exist' });
    assert.equal(toHttpError(invalidRequest([])).code, 'VALIDATION_ERROR');
  });
});

describe('toHttpError', () => {
  const cases: [string, unknown, number, string][] = [
    ['malformed JSON', { type: 'entity.parse.failed', status: 400 }, 400, 'INVALID_JSON'],
    ['body too large', { type: 'entity.too.large', status: 413 }, 413, 'PAYLOAD_TOO_LARGE'],
    ['unsupported encoding', { type: 'encoding.unsupported', status: 415 }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['unsupported charset', { type: 'charset.unsupported', status: 415 }, 415, 'UNSUPPORTED_MEDIA_TYPE'],
    ['aborted request', { type: 'request.aborted', status: 400 }, 400, 'BAD_REQUEST'],
    ['other 4xx (e.g. malformed URL)', { status: 400 }, 400, 'BAD_REQUEST'],
    ['statusCode instead of status', { statusCode: 404 }, 404, 'BAD_REQUEST'],
    ['database unreachable', Object.assign(new Error('connect'), { code: 'ECONNREFUSED' }), 503, 'SERVICE_UNAVAILABLE'],
    ['connection exception (SQLSTATE 08006)', Object.assign(new Error('x'), { code: '08006' }), 503, 'SERVICE_UNAVAILABLE'],
    ['query timeout', new Error('Query read timeout'), 503, 'SERVICE_UNAVAILABLE'],
    ['unknown error', new Error('boom'), 500, 'INTERNAL_ERROR'],
    ['a thrown string', 'boom', 500, 'INTERNAL_ERROR'],
    ['null', null, 500, 'INTERNAL_ERROR'],
    ['5xx status from a library is not trusted', { status: 502 }, 500, 'INTERNAL_ERROR'],
  ];
  for (const [name, error, status, code] of cases) {
    test(`${name} → ${status} ${code}`, () => {
      const result = toHttpError(error);
      assert.equal(result.status, status);
      assert.equal(result.code, code);
    });
  }

  test('503s include Retry-After and generic messages never echo the original error', () => {
    const result = toHttpError(Object.assign(new Error('password authentication failed for user "x"'), { code: '57P03' }));
    assert.deepEqual(result.headers, { 'Retry-After': '5' });
    assert.doesNotMatch(result.message, /password|user/);
  });
});

describe('Request body errors over HTTP', () => {
  let database: TestDatabase;
  let server: TestServer;

  before(async () => {
    database = await createTestDatabase();
  });

  after(async () => {
    await database.close();
  });

  let finishToken: string;

  beforeEach(async () => {
    await database.reset();
    server = await startTestServer(database);
    const created = await fetch(`${server.baseUrl}/api/matches`, { method: 'POST' });
    ({ finishToken } = (await created.json()) as { finishToken: string });
  });

  afterEach(async () => {
    await server.close();
  });

  const patch = (headers: Record<string, string>, body?: string) =>
    fetch(`${server.baseUrl}/api/matches/1`, {
      method: 'PATCH',
      headers: { ...headers, ...bearer(finishToken) },
      ...(body === undefined ? {} : { body }),
    });
  const codeOf = async (res: Response) => ((await res.json()) as ErrorBody).error.code;

  test('415 when the body is not JSON', async () => {
    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', 'application/xml']) {
      const res = await patch({ 'Content-Type': contentType }, 'winner=You');
      assert.equal(res.status, 415, contentType);
      assert.equal(await codeOf(res), 'UNSUPPORTED_MEDIA_TYPE');
    }
  });

  test('JSON with a charset parameter is accepted', async () => {
    const res = await patch({ 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify({ winner: 'You' }));
    assert.equal(res.status, 200);
  });

  test('415 for an unsupported charset or content encoding', async () => {
    const charset = await patch({ 'Content-Type': 'application/json; charset=klingon' }, '{"winner":"You"}');
    assert.equal(charset.status, 415);
    assert.equal(await codeOf(charset), 'UNSUPPORTED_MEDIA_TYPE');

    const encoding = await patch({ 'Content-Type': 'application/json', 'Content-Encoding': 'compress-9000' }, '{}');
    assert.equal(encoding.status, 415);
    assert.equal(await codeOf(encoding), 'UNSUPPORTED_MEDIA_TYPE');
  });

  test('no body and no Content-Type → 400 validation error (not 415)', async () => {
    const res = await patch({});
    assert.equal(res.status, 400);
    assert.equal(await codeOf(res), 'VALIDATION_ERROR');
  });

  test('JSON bodies that are not objects → 400', async () => {
    for (const body of ['[]', '[{"winner":"You"}]', '"You"', '42', 'null']) {
      const res = await patch({ 'Content-Type': 'application/json' }, body);
      assert.equal(res.status, 400, body);
    }
  });
});
