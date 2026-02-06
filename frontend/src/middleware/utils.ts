import { NextRequest, NextResponse } from 'next/server';

export function getPathSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean);
}

export function getFirstPathSegment(pathname: string): string | undefined {
  return getPathSegments(pathname)[0];
}

export function getAcceptLanguageValues(request: NextRequest): string[] {
  const h = request.headers.get('Accept-Language');
  if (!h) return [];
  return h.split(',').map((x) => (x.split(';')[0]?.trim() ?? '')).filter(Boolean);
}

export function createRedirectResponse(
  request: NextRequest,
  targetPath: string,
  status = 307
): NextResponse {
  return NextResponse.redirect(new URL(targetPath, request.url), status);
}
