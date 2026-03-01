const path = require('path');
const { DEFAULT_BACKEND_URL, getServerBackendUrl } = require('./env-defaults.cjs');
// Root .env first (shared), then frontend/.env so frontend overrides (e.g. NEXT_PUBLIC_API_URL)
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '.env'), override: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  env: {
    // Base origin for API. Set to "" for same-origin (rewrites proxy /api to backend so cookies work).
    // Only default when unset; preserve explicit "".
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL !== undefined ? process.env.NEXT_PUBLIC_API_URL : DEFAULT_BACKEND_URL,
  },
  // Proxy /api to backend when browser uses same-origin (NEXT_PUBLIC_API_URL=""). Ensures refresh cookie is set for app origin.
  async rewrites() {
    const backend = getServerBackendUrl(process.env);
    // Ensure backend URL has a protocol for rewrites
    if (!backend || (!backend.startsWith('http://') && !backend.startsWith('https://'))) {
      // If no valid backend URL, skip rewrites (client will use NEXT_PUBLIC_API_URL)
      return [];
    }
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
  // Shared is pre-built to dist/ (see build:shared); no transpilePackages needed
  // Prevent infinite reload in Docker (--webpack forces webpack so this applies)
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        aggregateTimeout: 600,
        ignored: ['**/node_modules', '**/.git', '**/.next', '**/dist', '**/.yarn'],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
