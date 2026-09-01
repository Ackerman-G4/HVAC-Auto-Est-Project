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
    coverage: {
      // v8 uses the engine's built-in coverage. The istanbul provider
      // instruments source instead and runs materially slower for the same
      // answer on this codebase.
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      reportsDirectory: './coverage',

      // Measure the layers a unit test can actually reach.
      //
      // `include` is deliberately narrow rather than all of `src`. Pulling in
      // pages, React components and the 3D viewers would put ~40k lines of
      // browser-only code in the denominator, and the resulting percentage
      // would move with how much UI exists rather than with how well the
      // calculation and boundary code is tested. A number that cannot be acted
      // on is worse than no number.
      include: [
        'src/lib/engine/**/*.ts',
        'src/lib/validation/**/*.ts',
        'src/lib/functions/**/*.ts',
        'src/lib/firebase/**/*.ts',
        'src/lib/utils/**/*.ts',
        'src/lib/auth/**/*.ts',
        'src/lib/simulation/**/*.ts',
      ],
      exclude: ['**/__tests__/**', '**/*.d.ts', '**/types.ts'],

      /**
       * Thresholds sit at the measured figure, rounded down a point.
       *
       * The point of headroom is not slack — it is so a refactor that moves a
       * few lines between files does not fail the build while coverage is
       * materially unchanged. A real regression drops far more than that.
       *
       * `engine` and `validation` are held far higher than the global floor
       * because they carry the calculation correctness and boundary safety
       * guarantees. The global number is dragged down by `lib/firebase` (5%)
       * and `lib/auth` (6%), which are mostly IO and are the next targets —
       * raising the global floor is how that work gets recorded.
       */
      thresholds: {
        lines: 31,
        statements: 31,
        branches: 76,
        functions: 62,

        'src/lib/engine/**': {
          // Branches measured 79.8; held at 79 for the same reason as above.
          lines: 74,
          statements: 74,
          branches: 79,
          functions: 80,
        },
        'src/lib/validation/**': {
          lines: 77,
          statements: 77,
          branches: 85,
          functions: 75,
        },
      },
    },
  },
});
