import { readFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';

/**
 * Returns the app version: from version.json (written at Docker build with GIT_SHA)
 * or from runtime env; falls back to 'dev' in local dev.
 */
export async function GET() {
  let version: string = process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.GIT_SHA ?? '';

  if (!version && typeof process.cwd === 'function') {
    try {
      const versionPath = path.join(process.cwd(), 'frontend/public/version.json');
      const data = await readFile(versionPath, 'utf-8');
      const parsed = JSON.parse(data) as { version?: string };
      if (parsed.version) version = parsed.version;
    } catch {
      // File missing (e.g. local dev) or invalid
    }
  }

  return NextResponse.json({ version: version || 'dev' });
}
