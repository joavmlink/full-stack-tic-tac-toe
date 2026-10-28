import assert from 'node:assert/strict';
import http from 'node:http';
import { describe, test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { startServer } from '../src/server.js';
import { captureLogger } from './helpers.js';

const testConfig = (port = 0) => loadConfig({ PORT: String(port), PGLITE_DIR: 'memory://' });

describe('startServer', () => {
  test('starts, serves requests, logs the startup and closes cleanly', async () => {
    const logger = captureLogger();
    const running = await startServer(testConfig(), logger);
    try {
      assert.ok(running.port > 0);
      const res = await fetch(`http://127.0.0.1:${running.port}/api/matches`, { method: 'POST' });
      assert.equal(res.status, 201);

      const started = logger.entries.find((entry) => entry.message === 'server started');
      assert.equal(started?.fields.url, `http://localhost:${running.port}/api`);
      assert.match(String(started?.fields.database), /PGlite/);
    } finally {
      await running.close();
    }
    // After close the port is free again.
    await assert.rejects(fetch(`http://127.0.0.1:${running.port}/api/health`));
  });

  test('close does not hang with an open keep-alive connection', async () => {
    const running = await startServer(testConfig(), captureLogger());
    const agent = new http.Agent({ keepAlive: true });
    await new Promise<void>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port: running.port, path: '/api/health', agent }, (res) => {
          res.resume();
          res.on('end', resolve);
        })
        .on('error', reject);
    });
    try {
      const started = Date.now();
      await running.close();
      assert.ok(Date.now() - started < 3000, 'close() should not wait for idle keep-alive sockets');
    } finally {
      agent.destroy();
    }
  });

  test('closing twice returns the same promise', async () => {
    const running = await startServer(testConfig(), captureLogger());
    const first = running.close();
    assert.equal(running.close(), first);
    await first;
  });

  test('rejects when the port is already in use (and closes its database)', async () => {
    const first = await startServer(testConfig(), captureLogger());
    try {
      await assert.rejects(startServer(testConfig(first.port), captureLogger()), /EADDRINUSE/);
    } finally {
      await first.close();
    }
  });
});
