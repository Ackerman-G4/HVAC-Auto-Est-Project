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
     * No thresholds are set here. A threshold chosen before the baseline is
     * known is arbitrary, and one set above the current figure turns the gate
     * red on arrival. TASK 5.2 sets them from the number this produces.
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
