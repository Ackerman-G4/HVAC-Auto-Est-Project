import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit + behavioural tests. The default environment stays `node` — most of the
// suite exercises engines, pricing, geometry and BOQ math with no DOM. The few
// tests that need one (hook/component behaviour) opt in per file with a
// `// @vitest-environment jsdom` docblock, so the fast path stays fast.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.smoke.test.{ts,tsx}'],
    // The Firestore rules suite needs a running emulator, so it is excluded
    // here to keep `npm run check` hermetic and offline. It runs via
    // `npm run test:rules`, which starts the emulator around it.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/**/firestore-rules.test.ts'],
    globals: false,
  },
});
