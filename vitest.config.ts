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

    /**
     * Coverage, REMEDIATION_PLAN.md TASK 5.1.
     *
     * The v8 provider reads the runtime's own coverage data rather than
     * rewriting sources through Babel, so there is no instrumentation pass
     * between what runs and what is measured. The istanbul provider was the
     * alternative: a smaller package, but it reports on transformed output and
     * slows every run.
     *
     * Thresholds (TASK 5.2) are set from the measured baseline, never above
     * it: a gate that is red on arrival trains people to ignore it.
     *
     * Only 'statements' and 'lines' are gated. V8 emits a single placeholder
     * branch and a single placeholder function for any file it never loads,
     * so the 245 untested files here contribute 38,060 statements but exactly
     * 245 branches and 245 functions. The branch and function percentages
     * therefore describe only the already-tested subset, and gating on them
     * would gate nothing. This is measured, not assumed -- see
     * REMEDIATION_PLAN.md TASK 5.1.
     *
     * 'include' is stated explicitly because v8 otherwise reports only files a
     * test happened to load, which counts an untested module as absent rather
     * than as zero and materially overstates the result.
     */
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      /**
       * Floors, not targets. Each sits at the integer below its measured
       * figure, so coverage cannot fall while an unrelated refactor that moves
       * the number by a tenth of a point does not turn CI red.
       *
       * Graduated because a single global number would be wrong in both
       * directions at once: 14 % is the whole repository including untested UI,
       * while the two directories carrying the calculation-correctness and
       * boundary-safety guarantees are already near 75 %. One number would
       * either let those two rot or fail the other forty.
       */
      thresholds: {
        // Whole repository. Measured 14.12 %.
        statements: 14,
        lines: 14,

        // Pure domain calculation. Measured 74.5 %.
        'src/lib/engine/**': {
          statements: 74,
          lines: 74,
        },

        // The HTTP trust boundary. Measured 71.1 %.
        'src/lib/validation/**': {
          statements: 71,
          lines: 71,
        },
      },
      exclude: [
        // Tests measuring themselves says nothing.
        'src/**/__tests__/**',
        'src/**/*.{test,spec}.{ts,tsx}',
        // Type-only. Erased at compile time, so there is no statement to cover
        // and counting them would dilute the figure rather than inform it.
        'src/types/**',
        'src/**/*.d.ts',
        // Next.js route and layout scaffolding that is configuration, not logic.
        'src/app/**/layout.tsx',
        'src/app/**/loading.tsx',
        'src/app/**/error.tsx',
        'src/app/**/not-found.tsx',
        'src/app/**/global-error.tsx',
      ],
    },
  },
});
