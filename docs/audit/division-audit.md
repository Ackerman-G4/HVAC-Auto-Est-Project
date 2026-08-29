# DIVISION AUDIT

Deliverable for REMEDIATION_PLAN.md **TASK 2.3 — Sweep the remaining engine divisions**.

Date: 2026-08-29
Scope: `src/lib/engine`, excluding `__tests__`.
Method: lexical tokenizer, not grep. See "Counting method" below.

---

## 0. Correction to the plan's figure

The plan states "all 197 division operations under `src/lib/engine`". That number
does not reproduce against any measurable definition.

| Measurement | Count |
|---|---|
| Lines under `src/lib/engine` containing any `/` character | 485 |
| **Genuine division operators, tokenized, `src/lib/engine`** | **74** |
| Genuine division operators, `src/lib/functions` | 312 |
| Genuine division operators, `src/lib/simulation` | 39 |
| Genuine division operators, `src/lib` overall | 471 |

197 sits between the naive line count and the real operator count, so it was most
likely a grep over a differently drawn boundary. The audited figure is **74**.

### Counting method

A grep for `/` is useless here: it also matches line comments, block comments,
regex literals, import paths and string contents. The count above comes from a
tokenizer that tracks lexical state — string literals, template literals, both
comment forms, and the regex-versus-division ambiguity resolved by whether the
previous significant character can end an expression. Divisions appearing inside
template literals are excluded deliberately: those are display strings, not
computation.

---

## 1. Classification

Every one of the 74 sites falls into exactly one category.

| Category | Meaning | Count |
|---|---|---|
| **A** | Already guarded — an explicit check at or before the division | 34 |
| **B** | Denominator is a compile-time constant or a module constant | 27 |
| **C** | Denominator originates outside the function and was unguarded | 13 |

Category C is the only one requiring work. All 13 are now guarded.

### Per file

| File | Sites | A | B | C |
|---|---:|---:|---:|---:|
| `simulation/geometry-builder.ts` | 27 | 21 | 2 | 4 |
| `hvac/airflow-duct-engine.ts` | 16 | 6 | 10 | 0 |
| `comfort/pmv.ts` | 10 | 1 | 1 | 8 |
| `units.ts` | 7 | 0 | 7 | 0 |
| `hvac/load-calculation-engine.ts` | 4 | 1 | 2 | 1 |
| `simulation/result-importer.ts` | 4 | 2 | 2 | 0 |
| `hvac/equipment-selection-engine.ts` | 3 | 2 | 1 | 0 |
| `numeric-guards.ts` | 1 | 1 | 0 | 0 |
| `pipeline.ts` | 1 | 1 | 0 | 0 |
| `simulation/openfoam-exporter.ts` | 1 | 0 | 1 | 0 |
| **Total** | **74** | **34** | **27** | **13** |

---

## 2. Category C in consequence order, and what was done

### C1 — Tons of refrigeration, from a rule-set denominator (money path)

`hvac/load-calculation-engine.ts`, `trRequired = totalBtuAfterFactors / btuPerTr`.

`btuPerTr` is `getConstant('btu_per_tr')`, resolved from the **rule set** — loaded
data, not a literal. `getConstant` throws only when the key is *absent*; a rule
document supplying `btu_per_tr: 0` returns 0 and the division yields `Infinity`.

This is the single highest-consequence site in the engine. `trRequired` feeds
equipment quantity, which feeds the bill of quantities, which feeds the currency
total — the exact propagation path finding F2 describes, reached from a different
direction. `Infinity` survives `Math.ceil` and `Math.max` untouched.

Now `safeDivide(..., { requirePositive: true })`. A negative coefficient is
rejected too, because it would invert the sign of the load rather than merely
inflate it.

### C2–C4 — Comfort model denominators that vanish above absolute zero

`comfort/pmv.ts`. Three denominators are functions of temperature or clothing:

| Site | Denominator | Zero at |
|---|---|---|
| `saturationVaporPressurePa` | `tempC + 243.04` | −243.04 °C |
| `pmvPpd` vapour pressure | `ta + 235` | −235 °C |
| `pmvPpd` clothing-surface solve | `3.5 · icl + 0.1` | `clo` ≈ −0.184 |

Both temperature singularities sit **above** absolute zero (−273.15 °C), so a
range check against physical validity alone would not catch them. Each is now
routed through `safeDivide` at the point of division, which is the only place the
fault is still locatable.

### C5–C11 — Unvalidated inputs crossing into the comfort model

`pmvPpd` validated `vel` and `rh` (`Math.max`/`Math.min` clamps) but not `ta`,
`tr`, `met`, `clo` or `wme`. `humidityRatioToRH` clamped with
`Math.max(0, humidityRatio)`, **which is not a guard**: `Math.max(0, NaN)` is
`NaN`. A non-finite temperature from a simulation result therefore produced a
`NaN` comfort score that rendered as a real value.

All seven now carry `assertFinite`, plus `assertPhysicalTemperature` for `ta` and
`tr` per CLAUDE.md §8.6, and a non-negative check on `clo`.

Caller of note: `src/lib/functions/building-cfd-simulation.ts` passes
`avgTemperature` straight from a solve, so this was reachable in production.

### C12–C13 — Grid dimensions that silently `NaN` the entire mesh

`simulation/geometry-builder.ts`. Every cell index divides by the cell size `cs`,
which comes from `clampCellSize`. That function bounds `cs` with `Math.max` and
`Math.min` — and **both propagate `NaN`**, so a non-finite room dimension made
`cs` `NaN` and every one of the 21 downstream `/ cs` divisions produced `NaN`
rather than failing. The grid came back structurally intact and numerically void.

`clampCellSize` now asserts all three dimensions are positive and finite, which
is what makes the 21 Category A sites genuinely safe rather than incidentally so.
`recommendCellSize` additionally asserts its `targetCellBudget` parameter, which
is caller-supplied and divided by directly.

---

## 3. Category A — why each is already safe

| Site | What makes it safe |
|---|---|
| `geometry-builder` × 21 `/ cs` | `cs` ≥ `MIN_CELL_SIZE` by construction, now underwritten by the dimension assertions in C12 |
| `geometry-builder` face velocity | `faceArea > 0 ? … : 1.0` |
| `airflow-duct` branch airflow check | `inputs.branches > 0` in the same condition |
| `airflow-duct` duct area | `Math.max(1, velocityFpm)` |
| `airflow-duct` rectangular height | `width = Math.max(8, …)` |
| `airflow-duct` branch ratios | `if (branches <= 1) return [1]` precedes it |
| `airflow-duct` branch velocity | diameter drawn from a positive catalogue; `supplyCfm` clamped to [200, 60000] |
| `airflow-duct` fan power | `fanEfficiency` clamped to [0.4, 0.85] |
| `load-calculation` occupant density | `Math.max(1, inputs.areaM2)` |
| `result-importer` × 2 averages | `count > 0 ? sum / count : …` |
| `equipment-selection` efficiency score | `annualEnergyKwh > 0 ? … : 0` |
| `equipment-selection` capex score | `capexSpan = Math.max(1, maxCapex − minCapex)` |
| `pipeline` unit price | `Math.max(item.quantity, 1)` |
| `numeric-guards` | the guard implementation itself |

Note the distinction that matters: a `Math.max(1, x)` denominator is Category A
because it cannot reach zero, **but it is not equivalent to a guard**. It converts
a detectable fault into a plausible wrong number, which `numeric-guards.ts`
argues is strictly worse. These are recorded as safe against `Infinity`, not as
correct. Re-examining them is out of scope for TASK 2.3 and is noted in §5.

---

## 4. Evidence

Guards are covered by `src/lib/engine/__tests__/division-guards.test.ts`, 21
tests, each driving a denominator to zero, negative or non-finite and asserting a
typed error, per CLAUDE.md §6.2.

The money-path guard was verified **load-bearing**: with the `safeDivide` call
reverted to the raw division, 2 of those tests fail. The guard was then restored
and the suite re-run green. Asserting a guard works is not the same as showing
the test would notice its absence.

Gates at close: `tsc` 0 errors · `eslint src` 0 errors, 77 warnings · `vitest`
41 files, 434 tests passing.

---

## 5. What this audit does not cover

Two items are recorded rather than silently absorbed.

**1. The scope boundary is narrower than the risk surface.** TASK 2.3 names
`src/lib/engine`, which holds 74 of the 471 divisions under `src/lib`. The larger
concentration is `src/lib/functions` at **312**, and per CLAUDE.md §3 that
directory holds "domain helpers, psychrometrics, cost, compliance" — calculation
code by any reasonable reading. The heaviest files:

| File | Divisions |
|---|---:|
| `functions/cfd-simulation.ts` | 119 |
| `functions/auto-detect-equipment.ts` | 32 |
| `functions/building-cfd-simulation.ts` | 29 |
| `functions/cooling-optimization.ts` | 16 |
| `functions/duct-sizing.ts` | 15 |
| `functions/psychrometric.ts` | 15 |

`src/lib/simulation` adds 39 more. A follow-up task extending this sweep to
`src/lib/functions` is the natural successor, and it is now scoped from
measurement rather than estimate.

**2. Clamping is still present as a pattern.** The eleven Category A sites that
rely on `Math.max(1, x)` or `Math.max(8, x)` do prevent `Infinity`, but they
substitute an invented denominator for a bad one. `numeric-guards.ts` was written
specifically to argue against this. Converting them is a behavioural change to
calculation output, so it is a decision rather than a cleanup, and it is raised
here rather than made.
