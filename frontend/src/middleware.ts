import { DEFAULT_LOCALIZED_HOME } from 'i18n';
import { determineTargetLocale, getLocaleFromPathname } from 'i18n/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { createRedirectResponse } from './middleware/utils';

function handleI18n(request: NextRequest): NextResponse | null {
  const { pathname, search } = request.nextUrl;
  if (getLocaleFromPathname(pathname)) return null;
  const targetLocale = determineTargetLocale(request);
  const localizedPathname =
    pathname === '/' ? `/${targetLocale}${DEFAULT_LOCALIZED_HOME}` : `/${targetLocale}${pathname}`;
  return createRedirectResponse(request, localizedPathname + search, 308);
}

export function middleware(request: NextRequest): NextResponse {
  const i18nResponse = handleI18n(request);
  if (i18nResponse) return i18nResponse;
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|apple-touch-icon.png).*)',
  ],
};
