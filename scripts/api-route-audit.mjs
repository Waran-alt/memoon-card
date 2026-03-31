#!/usr/bin/env node
/**
 * Compare Express routes (from backend/src/index.ts mounts + route files) to /api/* strings
 * in frontend/src and frontend/e2e. Heuristic: path segment signatures (:id and ${...} → :p).
 *
 * Run from repo root: node scripts/api-route-audit.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function walkDir(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkDir(full, acc);
    else acc.push(full);
  }
  return acc;
}

/** @returns {Map<string, string>} varName -> resolved .ts path */
function parseRouterImports(indexText) {
  const map = new Map();
  const re = /import\s+(\w+)\s+from\s+['"]\.\/routes\/([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(indexText))) {
    const spec = m[2].replace(/\.ts$/, '');
    const abs = path.join(REPO_ROOT, 'backend/src/routes', `${spec}.ts`);
    if (fs.existsSync(abs)) map.set(m[1], abs);
  }
  return map;
}

function parseAppMounts(indexText, imports) {
  const mounts = [];
  /** Handles `app.use(prefix, authMiddleware, …, router)` — router is the last identifier. */
  const useRe = /app\.use\(\s*['"]([^'"]+)['"]\s*,([\s\S]*?)\)\s*;/g;
  let m;
  while ((m = useRe.exec(indexText))) {
    const prefix = m[1];
    const inner = m[2];
    const ids = inner
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\w+$/.test(s));
    const routerVar = ids[ids.length - 1];
    if (!routerVar || !imports.has(routerVar)) continue;
    mounts.push({ prefix, routerVar });
  }
  const getRe = /app\.get\(\s*['"](\/api[^'"]+)['"]/g;
  while ((m = getRe.exec(indexText))) {
    mounts.push({ prefix: m[1], inline: true });
  }
  return mounts;
}

/** Extract .METHOD('path' or `path` with possible newlines after ( */
function extractMountedRoutes(source) {
  const routes = [];
  const re = /\.(get|post|put|patch|delete)\(\s*(?:\/\*[\s\S]*?\*\/)?\s*['"`]([^'"`]+)['"`]/gs;
  let m;
  while ((m = re.exec(source))) {
    routes.push({ method: m[1].toUpperCase(), path: m[2] });
  }
  return routes;
}

function joinMountPrefix(prefix, routePath) {
  if (routePath === '/') return prefix.replace(/\/$/, '') || '/';
  const a = prefix.replace(/\/$/, '');
  const b = routePath.startsWith('/') ? routePath : `/${routePath}`;
  return `${a}${b}`;
}

function pathToSignature(url) {
  const p = url.split('?')[0].replace(/\/+$/, '');
  return p
    .split('/')
    .filter(Boolean)
    .map((seg) => (seg.startsWith(':') ? ':p' : seg))
    .join('/');
}

/** Normalize frontend (and test) paths so UUIDs / e2e slugs match backend :id segments. */
function normalizePathSignature(rawPath) {
  const p = rawPath.split('?')[0].replace(/\/+$/, '');
  return p
    .split('/')
    .filter(Boolean)
    .map((seg) => {
      if (seg === '___DYN___') return ':p';
      if (seg.startsWith(':')) return ':p';
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          seg
        )
      ) {
        return ':p';
      }
      if (/^(deck|card|user)-/i.test(seg)) return ':p';
      return seg;
    })
    .join('/');
}

function collectAuthRouteFiles() {
  const dir = path.join(REPO_ROOT, 'backend/src/routes/auth');
  return walkDir(dir).filter((f) => f.endsWith('.routes.ts'));
}

function buildBackendRoutes() {
  const indexPath = path.join(REPO_ROOT, 'backend/src/index.ts');
  const indexText = read(indexPath);
  const imports = parseRouterImports(indexText);
  const mounts = parseAppMounts(indexText, imports);
  /** @type {{ method: string, fullPath: string, sig: string }[]} */
  const out = [];

  for (const mount of mounts) {
    if (mount.inline) {
      out.push({
        method: 'GET',
        fullPath: mount.prefix,
        sig: pathToSignature(mount.prefix),
      });
      continue;
    }
    const file = imports.get(mount.routerVar);
    if (!file) continue;

    let filesToScan = [file];
    if (file.endsWith(`${path.sep}auth.routes.ts`)) {
      filesToScan = collectAuthRouteFiles();
    }

    for (const f of filesToScan) {
      const routes = extractMountedRoutes(read(f));
      for (const r of routes) {
        const fullPath = joinMountPrefix(mount.prefix, r.path);
        out.push({
          method: r.method,
          fullPath,
          sig: pathToSignature(fullPath),
        });
      }
    }
  }

  return out;
}

function collectFrontendApiStrings() {
  const roots = [
    path.join(REPO_ROOT, 'frontend/src'),
    path.join(REPO_ROOT, 'frontend/e2e'),
  ];
  const files = roots.flatMap((r) =>
    walkDir(r).filter((f) => /\.(tsx?|jsx?|mjs)$/.test(f))
  );
  const found = new Set();

  const add = (s) => {
    const t = s.trim().split('?')[0].replace(/\/+$/, '');
    if (!t.startsWith('/api') || t.includes('*')) return;
    // Spurious sub-match (no GET /api/cards root in API)
    if (t === '/api/cards') return;
    found.add(t);
  };

  const pathRe = /\/api(?:\/(?:___DYN___|[a-zA-Z0-9_.-]+))+/g;

  for (const file of files) {
    const text = read(file);
    const sanitized = text.replace(/\$\{[^}]+\}/g, '___DYN___');
    let m;
    while ((m = pathRe.exec(sanitized))) {
      add(m[0]);
    }
  }

  return [...found];
}

function main() {
  const backend = buildBackendRoutes();
  const frontendStrings = collectFrontendApiStrings();
  const frontendSigs = new Set(frontendStrings.map(normalizePathSignature));

  const bySigBackend = new Map();
  for (const b of backend) {
    if (!bySigBackend.has(b.sig)) bySigBackend.set(b.sig, []);
    bySigBackend.get(b.sig).push(b);
  }

  const backendSigs = new Set(backend.map((b) => b.sig));

  const unusedByFrontend = [];
  for (const [sig, list] of bySigBackend) {
    if (!frontendSigs.has(sig)) {
      unusedByFrontend.push({ sig, routes: list });
    }
  }
  unusedByFrontend.sort((a, b) => a.sig.localeCompare(b.sig));

  const unmatchedFrontend = [];
  for (const s of frontendStrings) {
    const sig = normalizePathSignature(s);
    if (!backendSigs.has(sig)) unmatchedFrontend.push({ raw: s, sig });
  }
  unmatchedFrontend.sort((a, b) => a.sig.localeCompare(b.sig));

  console.log('=== API route audit (heuristic) ===\n');
  console.log(`Backend route handlers (parsed): ${backend.length}`);
  console.log(`Unique backend signatures: ${backendSigs.size}`);
  console.log(`Frontend /api string literals (approx): ${frontendStrings.length}`);
  console.log(`Unique frontend signatures: ${frontendSigs.size}\n`);

  console.log('--- Likely backend-only (no matching frontend path signature) ---');
  if (unusedByFrontend.length === 0) {
    console.log('(none)\n');
  } else {
    for (const u of unusedByFrontend) {
      console.log(`  ${u.sig}`);
      const sorted = [...u.routes].sort(
        (a, b) => a.method.localeCompare(b.method) || a.fullPath.localeCompare(b.fullPath)
      );
      for (const r of sorted) {
        console.log(`    ${r.method.padEnd(6)} ${r.fullPath}`);
      }
    }
    console.log('');
  }

  console.log('--- Frontend /api usages with no matching backend signature ---');
  if (unmatchedFrontend.length === 0) {
    console.log('(none)\n');
  } else {
    const seen = new Set();
    for (const u of unmatchedFrontend) {
      const key = u.sig + u.raw;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`  sig=${u.sig}  raw=${u.raw}`);
    }
    console.log('');
  }

  console.log(
    'Notes: matching ignores HTTP method (any frontend hit on same path signature counts); :id, UUIDs, ${…}, ' +
      'and deck-*/card-* test slugs normalize to :p. /api/test-fsrs is NODE_ENV !== production only.'
  );
}

main();
