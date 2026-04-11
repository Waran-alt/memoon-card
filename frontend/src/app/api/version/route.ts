import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

/**
 * Returns the product version: RELEASE_LABEL (root package.json semver ± short sha) baked at build,
 * or version.json from Docker build; falls back to 'dev'. Always returns 200 so the UI never blocks.
 * In production behind Nginx, /api/version is usually served by the backend (same label via APP_RELEASE).
 */
export async function GET() {
  let version = 'dev';
  try {
    version = process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.APP_RELEASE ?? process.env.GIT_SHA ?? '';
    if (!version && typeof process.cwd === 'function') {
      const versionPath = path.join(process.cwd(), 'frontend/public/version.json');
      const data = await readFile(versionPath, 'utf-8');
      const parsed = JSON.parse(data) as { version?: string };
      if (parsed.version) version = parsed.version;
    }
    if (!version) version = 'dev';
  } catch {
    version = 'dev';
  }
  return NextResponse.json({ version });
}
