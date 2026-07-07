import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Pure-function unit + behavioral smoke tests (plan §10). Node environment —
// these exercise engines, pricing, geometry and BOQ math, not the DOM.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts', 'src/**/*.smoke.test.ts'],
    globals: false,
  },
});
