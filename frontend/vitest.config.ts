import { defineConfig } from 'vitest/config';
import path from 'path';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Cast: @vitejs/plugin-react is typed against project vite; vitest uses its own vite types
  plugins: [react()] as import('vitest/config').UserWorkspaceConfig['plugins'],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'i18n/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', '.next'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}', 'i18n/**/*.{ts,tsx}'],
      exclude: [
        'node_modules/',
        '.next/',
        'e2e/**',
        'coverage/**',
        '**/*.config.{ts,js}',
        '**/*.{test,spec}.{ts,tsx}',
        '**/*.d.ts',
        '**/types/**',
        '**/__tests__/**',
        'src/test-utils.tsx',
        'vitest.setup.ts',
      ],
    },
    // Faster feedback: use single-thread by default; use --threads for CI
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      i18n: path.resolve(__dirname, './i18n/index.ts'),
    },
  },
});
