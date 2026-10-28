// Fails if any dependency isn't pinned to an exact version, or if the lockfile or the .npmrc
// settings that keep installs reproducible are missing. Usage: npm run check:versions
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const PACKAGES = ['package.json', 'backend/package.json', 'frontend/package.json'];
const REQUIRED_NPMRC = ['save-exact=true', 'engine-strict=true'];

// MAJOR.MINOR.PATCH with optional prerelease/build; no ^ ~ > < * x, tags or URLs.
const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;

/**
 * @param {Record<string, unknown>} pkg
 * @returns {{ section: string; name: string; version: string }[]}
 */
export function findNonExactVersions(pkg) {
  const problems = [];
  for (const section of SECTIONS) {
    const deps = /** @type {Record<string, string> | undefined} */ (pkg[section]);
    for (const [name, version] of Object.entries(deps ?? {})) {
      if (!EXACT_VERSION.test(version)) problems.push({ section, name, version });
    }
  }
  return problems;
}

/**
 * @param {string} root Repository root.
 * @returns {string[]} Human-readable problems (empty when everything complies).
 */
export function checkProject(root) {
  const problems = [];

  for (const file of PACKAGES) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) {
      problems.push(`${file} is missing`);
      continue;
    }
    for (const { section, name, version } of findNonExactVersions(JSON.parse(fs.readFileSync(full, 'utf8')))) {
      problems.push(`${file} › ${section} › ${name}: "${version}" is not an exact version`);
    }
  }

  if (!fs.existsSync(path.join(root, 'package-lock.json'))) {
    problems.push('package-lock.json is missing (run npm install and commit it)');
  }

  const npmrcPath = path.join(root, '.npmrc');
  const npmrc = fs.existsSync(npmrcPath)
    ? fs
        .readFileSync(npmrcPath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.replace(/\s+/g, ''))
    : [];
  for (const setting of REQUIRED_NPMRC) {
    if (!npmrc.includes(setting)) problems.push(`.npmrc must contain ${setting}`);
  }

  return problems;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const problems = checkProject(root);
  if (problems.length > 0) {
    console.error(`✖ Version policy violations:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log('✔ Every dependency is pinned to an exact version; lockfile and .npmrc are in place.');
}
