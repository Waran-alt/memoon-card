/**
 * Copy root package.json "version" into frontend, backend, and shared (one product version).
 */
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ver = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;

for (const ws of ['frontend', 'backend', 'shared']) {
  const p = path.join(root, ws, 'package.json');
  const pkg = JSON.parse(readFileSync(p, 'utf8'));
  pkg.version = ver;
  writeFileSync(p, `${JSON.stringify(pkg, null, 2)}\n`);
}
