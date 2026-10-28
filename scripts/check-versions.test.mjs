import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import { checkProject, findNonExactVersions } from './check-versions.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Creates a temporary project with the given files ({ "path": content }). */
function tempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-versions-'));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

const validProject = () => ({
  'package.json': { devDependencies: { concurrently: '10.0.6' } },
  'backend/package.json': { dependencies: { express: '5.3.0' } },
  'frontend/package.json': { dependencies: { react: '19.3.1', foo: '1.0.0-beta.2+build.5' } },
  'package-lock.json': '{}',
  '.npmrc': 'save-exact=true\nengine-strict=true\n',
});

describe('findNonExactVersions', () => {
  test('accepts exact versions, including prereleases', () => {
    assert.deepEqual(findNonExactVersions({ dependencies: { a: '1.2.3', b: '0.0.1-rc.1' } }), []);
  });

  test('detects ranges, tags and URLs in every section', () => {
    const problems = findNonExactVersions({
      dependencies: { a: '^1.0.0', b: '~2.0.0' },
      devDependencies: { c: 'latest', d: '>=3', e: '1.x' },
      optionalDependencies: { f: 'github:user/repo' },
      peerDependencies: { g: '*' },
    });
    assert.deepEqual(
      problems.map((p) => p.name),
      ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    );
  });

  test('a package.json without dependencies is valid', () => {
    assert.deepEqual(findNonExactVersions({}), []);
  });
});

describe('checkProject', () => {
  test('a compliant project has no problems', () => {
    assert.deepEqual(checkProject(tempProject(validProject())), []);
  });

  test('reports non-exact versions, a missing lockfile and missing .npmrc settings', () => {
    const files = validProject();
    files['backend/package.json'] = { dependencies: { express: '^5.3.0' } };
    delete files['package-lock.json'];
    files['.npmrc'] = 'engine-strict=true\n';
    const problems = checkProject(tempProject(files));
    assert.equal(problems.length, 3);
    assert.match(problems.join('\n'), /express: "\^5\.3\.0"/);
    assert.match(problems.join('\n'), /package-lock\.json is missing/);
    assert.match(problems.join('\n'), /save-exact=true/);
  });

  test('the real project complies with the policy', () => {
    assert.deepEqual(checkProject(ROOT), []);
  });
});
