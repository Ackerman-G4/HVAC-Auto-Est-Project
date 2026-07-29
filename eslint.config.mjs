import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
