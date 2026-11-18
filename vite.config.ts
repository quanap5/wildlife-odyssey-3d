import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Static, relocatable build: `base: './'` lets dist/ be served from any path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 5000,
    sourcemap: false,
    // Fonts stay as real files: a data: URI font can be refused by a host page's content policy.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
  test: { environment: 'node', include: ['src/tests/**/*.test.ts'], testTimeout: 30000 },
});
