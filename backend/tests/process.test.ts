import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const BACKEND_DIR = fileURLToPath(new URL('..', import.meta.url));

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs src/index.ts (the real entry point) as a child process with a clean environment.
 * `onLine` can stop it early (e.g. once it logs that it started).
 */
function runEntryPoint(
  env: Record<string, string>,
  onLine?: (line: string, stop: () => void) => void,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
      cwd: BACKEND_DIR,
      env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', PGLITE_DIR: 'memory://', ...env },
    });
    let stdout = '';
    let stderr = '';
    const stop = () => child.kill();
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      for (const line of chunk.toString().split('\n').filter(Boolean)) onLine?.(line, stop);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`entry point timed out\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, 30_000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

const parseLines = (text: string) =>
  text
    .split('\n')
    .filter((line) => line.startsWith('{'))
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe('src/index.ts', () => {
  test('starts, serves requests and logs its URL as JSON', async () => {
    let healthStatus: number | undefined;
    await runEntryPoint({ PORT: '0' }, (line, stop) => {
      const entry = JSON.parse(line) as Record<string, unknown>;
      if (entry.message !== 'server started') return;
      fetch(`${String(entry.url)}/health`)
        .then((res) => {
          healthStatus = res.status;
        })
        .finally(stop);
    });
    assert.equal(healthStatus, 200);
  });

  test('invalid configuration exits with code 1 and a clear message', async () => {
    const result = await runEntryPoint({ PORT: 'not-a-port' });
    assert.equal(result.code, 1);
    const [entry] = parseLines(result.stderr);
    assert.equal(entry?.level, 'error');
    assert.equal(entry?.message, 'startup failed');
    assert.match(String(entry?.error), /Invalid environment variables/);
  });

  test('a port already in use exits with code 1', async () => {
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, resolve));
    const { port } = blocker.address() as net.AddressInfo;
    try {
      const result = await runEntryPoint({ PORT: String(port) });
      assert.equal(result.code, 1);
      const [entry] = parseLines(result.stderr);
      assert.equal(entry?.message, 'startup failed');
      assert.match(String(entry?.error), /EADDRINUSE/);
    } finally {
      blocker.close();
    }
  });
});
