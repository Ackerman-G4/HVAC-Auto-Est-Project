import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // eslint-config-next bundles jsx-a11y but enables only a handful of its
    // rules. The recommended set is what catches the failures this app has:
    // unlabelled controls, click handlers on non-interactive elements, and
    // interactive elements with no keyboard path.
    //
    // Only the rules are spread — eslint-config-next has already registered the
    // plugin itself, and flat config refuses to let a plugin be defined twice.
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,

      // Enabling the recommended set surfaced 42 violations. 18 are fixed and
      // every other a11y rule is now an error, so new breakage in those is a
      // hard failure.
      //
      // The remaining 24 are all this one rule: a visible <label> with no
      // htmlFor, sitting beside a hand-rolled control. They are a migration
      // onto the `Field` primitive (docs/ui-inventory.md), not a config
      // question — ConfigPanel and FailurePanel are done and are the pattern
      // to copy. A warning keeps the count visible; making it an error today
      // would just mean disabling it per-file, which hides the same debt
      // somewhere harder to count.
      'jsx-a11y/label-has-associated-control': 'warn',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // Downgraded to a warning, deliberately.
      //
      // Every remaining hit is the same shape: a mount effect that kicks off an
      // async fetch (`useEffect(() => { load(); }, [load])`), where `load` flips
      // `loading` to true before its first `await`. The rule cannot see past the
      // await, so it reads that as a synchronous setState. Silencing it properly
      // would mean restructuring data fetching across ~20 files for one extra
      // render on mount.
      //
      // It stays on as a warning so genuinely new violations are still visible.
      // The other two rules in this plugin remain errors and are worth it — the
      // 7.1.1 upgrade that surfaced these also caught components being redefined
      // during render in the diagnostics page, which was remounting an <Input>
      // and eating keystrokes.
      'react-hooks/set-state-in-effect': 'warn',

      // REMEDIATION_PLAN.md TASK 5.5. An error, not a warning: the 135 bare
      // console calls this replaced were unstructured, unfilterable and
      // uncorrelated, and the only way that stays true is if adding one back
      // fails the build.
      //
      // src/lib/observability/logger.ts is the sole exemption below, because
      // console is what both runtimes actually give us to write to.
      'no-console': 'error',
    },
  },
  {
    // The logger is the one place allowed to reach the console.
    files: ['src/lib/observability/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Tests assert on captured output and use console for diagnostics.
    files: ['**/__tests__/**', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      'no-console': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
