import globals from "globals";
import nextConfig from "eslint-config-next/core-web-vitals";

const config = [
  {
    ignores: ["coverage/**", "test-results/**", "blob-report/**", "playwright-report/**"],
  },
  ...nextConfig,
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/vitest.setup.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];

export default config;
