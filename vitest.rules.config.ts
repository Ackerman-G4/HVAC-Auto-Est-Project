import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Firestore security rules suite.
 *
 * Separate from the main config because these require a running Firestore
 * emulator, and `npm run check` must stay hermetic — a gate that needs a
 * background service is a gate people learn to skip.
 *
 * Run with `npm run test:rules`, which starts the emulator around them.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/firestore-rules.test.ts'],
    globals: false,
    // Rules evaluation against the emulator is slower than in-process asserts,
    // and the suite clears Firestore between cases.
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // Shared emulator state — parallel files would clear each other's seed data.
    fileParallelism: false,
  },
});
