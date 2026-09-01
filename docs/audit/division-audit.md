# Division audit — `src/lib/engine`

TASK 2.3. Classifies every division in the calculation engine against CLAUDE.md
rule 6: *every division whose denominator originates outside the function must be
guarded before the division executes.*

## Count reconciliation

`REMEDIATION_PLAN.md` records **197 division operations**. That figure does not
survive checking, and the discrepancy is worth recording rather than repeating.

A naive `/` search counts four things that are not divisions:

| Counted as a division | Actually | Example |
|---|---|---|
| `// comment text` | line comment | `// Convert CFM to m³/s / area` |
| `'a/b'`, `` `${x}/input.json` `` | string and path literals | `cfd-cloud.ts` GCS object paths |
| `/[^a-z]/g` | regex literal, `g` flag | `openfoam-exporter.ts:780` |
| test files | not shipped code | `__tests__/**` |

After excluding those, `src/lib/engine` contains **76 division sites**, of which
19 have a numeric-literal denominator and **54 have a variable denominator**.
(76 raw matches include 3 regex flags; 76 − 3 = 73 real divisions, 19 literal +
54 variable.)

The audit tool used is `scratchpad/divaudit2.js` — it blanks comments, strings
and template literals before matching. Its first version did not, and reported
178 sites with 6 rule-6 candidates, of which 5 were false positives. That is the
reason for the reconciliation above.

## Classification of the 54 variable denominators

| Class | Count | Why it is safe | Where |
|---|---|---|---|
| Explicitly guarded | 8 | Ternary, early return, `&&` chain, or `safeDivide` | see below |
| Safe by construction | 27 | Denominator is `Math.max(floor, …)` with a positive floor, so it cannot reach zero | `geometry-builder` `cs` ×21, `capexSpan`, duct `width`, `pipeline`, `pmv:63` |
| Module or compile-time constant | 10 | Denominator is a `const` in the module or `Math.PI` | `units.ts` ×6, `MAX_CELLS_PER_AXIS` ×3, `Math.PI` |
| Local rounding factor | 3 | `10 ** digits` inside a private `round()` helper, `digits` defaulted to 2 | three engines |
| Domain-bounded offset | 4 | Denominator carries an additive offset placing the singularity far outside the physical domain | `pmv.ts` |
| The guard helper itself | 1 | `numeric-guards.ts` — this *is* the check | `safeDivide` |
| **Requires a guard** | **1** | — | `load-calculation-engine.ts` |

### The eight already guarded

| Site | Guard |
|---|---|
| `pmv.ts:66` | `if (pws <= 0) return 0;` |
| `airflow-duct-engine.ts:194` | `&& inputs.branches > 0 &&` earlier in the same `&&` chain — short-circuit means the division only runs when positive |
| `airflow-duct-engine.ts:252` | `if (branches <= 1) return [1];` above |
| `equipment-selection-engine.ts:136` | `candidate.annualEnergyKwh > 0 ? … : 0` |
| `geometry-builder.ts:372` | `faceArea > 0 ? … : 1.0` |
| `result-importer.ts:265`, `:279` | `count > 0 ? sum / count : avg…` |
| `load-calculation-engine.ts:242` | `safeDivide(…)` — **added by this task** |

### Domain-bounded offsets in `pmv.ts`

Four denominators carry an additive constant that moves the singularity outside
the range the correlation is defined over. These are not guarded, and that is
the correct call — a guard would be unreachable.

| Site | Denominator | Zero at | Domain |
|---|---|---|---|
| `:50` | `tempC + 243.04` | −243.04 °C | Magnus form is valid ≈ −45…60 °C |
| `:84` | `ta + 235` | −235 °C | Fanger PMV assumes an occupied space |
| `:97` | `3.5 * icl + 0.1` | `icl` = −0.0286 | clothing insulation is non-negative |
| `:112` | `100 + p3 * hc` | requires `p3 * hc` = −100 | convective coefficients are non-negative |

## The one finding

**`load-calculation-engine.ts:242` — `trRequired = totalBtuAfterFactors / btuPerTr`**

`btuPerTr` is not written in the function. It is read from the rules layer:

```ts
const BTU_PER_TR = () => getConstant('btu_per_tr');   // → cooling-load-rules.json
```

so it originates outside the function, which places it squarely under rule 6.
It is also the denominator with the worst blast radius in the engine: it sets
required tonnage, which sets equipment quantity, which multiplies into the bill
of quantities total (CLAUDE.md §8.4). IEEE 754 makes the failure quiet — a zero
denominator yields `Infinity`, which survives `Math.ceil` and `Math.max` and
reaches a currency figure with nothing thrown.

### The upstream cause was larger than the division

The rules files were entering the engine through a double assertion, six times:

```ts
cooling_load: coolingLoadRules as unknown as RuleSet,
```

`RuleSet` is a compile-time-only interface, so this asserted conformance without
checking any of it — the same escape hatch `any` provides, sitting directly
upstream of every physical constant the engine uses. A typo in a checked-in JSON
file (`"btu_per_tr": "12000"`, a renamed key, a missing value) compiled, linted,
and passed the entire suite.

### Fix — two layers

1. **`rules/rule-schema.ts` (new)** — Zod schemas mirroring `FormulaRule |
   LookupRule | ConstantsRule`, discriminated on `type`, every numeric
   `z.number().finite()`. `rule-store.ts` now parses through it instead of
   asserting. Catches missing keys, wrong types, `NaN` and the infinities.
2. **`safeDivide` at the division** — the schema cannot reject `btu_per_tr: 0`,
   because zero is legitimate for most constants and the schema has no way to
   know which are divisors. That case is caught at the point of division, with
   `requirePositive` and the code `INVALID_BTU_PER_TR`.

### Verification

Both layers were mutation-tested rather than assumed:

| Mutation | Result |
|---|---|
| `"btu_per_tr": 12000` → `"12000"` in the shipped JSON | 4 schema tests fail |
| `safeDivide(…)` → `totalBtuAfterFactors / btuPerTr` | 4 guard tests fail |

The guard tests drive the real engine with a `vi.mock` that deep-clones the
bundled rule set and replaces only the tonnage constant, so everything else on
the path stays as shipped.

An earlier version of the guard tests asserted only `toThrow(CalculationError)`
and **passed under mutation** — a corrupt tonnage also trips guards downstream in
equipment selection. They now assert the error `context`, which is what pins the
failure to this division.

## Flagged, not changed

Out of scope for this task; recorded so they are not lost.

1. **`geometry-builder.ts:372`** — `unit.airflowCFM * 0.000471947` is an inline
   CFM → m³/s conversion factor. CLAUDE.md rule 5 requires conversion inside a
   named function; `engine/units.ts` is where it belongs.
2. **`geometry-builder.ts:91`** — `recommendCellSize(input, targetCellBudget =
   500_000)`. The default is safe and no caller overrides it today, but the
   parameter is caller-supplied and unguarded. Zero budget with zero volume
   yields `NaN`, which `clampCellSize` propagates rather than rejecting.
3. **`load-calculation-engine.ts:100-106`** — `getEnvelopeFactor` catches and
   returns `120` as a "safe default". That is a silent fallback under rule 3:
   a missing envelope rule produces a plausible load rather than an error.
