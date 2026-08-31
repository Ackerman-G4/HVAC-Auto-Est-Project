# CLAUDE.md

Project instructions for Claude Code. Place this file at the repository root. Claude Code loads it automatically at the start of every session and on every subagent spawn.

Repository: HVAC-Auto-Est-Project
Stack: Next.js 16 App Router, React 19, TypeScript strict, Zustand 5, Tailwind CSS 4, Firebase Admin, three and react-three-fiber, Vitest.

---

## 1. Verified baseline

Do not assume the codebase is broken. As of the audit these gates pass:

| Gate | Command | Result |
|---|---|---|
| Types | `npx tsc --noEmit` | 0 errors |
| Lint | `npx eslint src` | 0 errors, 34 warnings |
| Tests | `npx vitest run` | 49 files, 549 tests, all passing |
| Coverage | `npm run test:coverage` | 16.79 % statements; thresholds enforced |
| Handler size | `npm run check:handler-size` | ratchet holds, 26 over the 120 ceiling |

Baseline refreshed 2026-08-29. Warnings fell 77 → 58; tests rose 200 → 549
across Phases 1 to 3 and 5. Coverage thresholds are graduated: 14 % globally,
74 % on `src/lib/engine`, 71 % on `src/lib/validation`.

`tsconfig.json` carries `strict`, plus `noImplicitOverride` and
`exactOptionalPropertyTypes`. The third flag, `noUncheckedIndexedAccess`, is
deliberately off: 66 % of its 1,343 errors are dense solver grids where the loop
already bounds the index. See REMEDIATION_PLAN.md TASK 5.4.

Two rules now enforced that were previously conventions:

- `no-console` is an **error**. All logging goes through
  `src/lib/observability/logger.ts`, which is the only file exempt.
- Route handlers under `src/app/api` are size-ratcheted. A new handler must be
  at or under 120 lines; the 26 existing ones over it may shrink, never grow.

Any change that turns one of these red is a regression and must be reverted or fixed before the task is considered complete. Never report a task complete without running all three.

---

## 2. Non negotiable rules

1. `any` is forbidden. `@ts-ignore`, `@ts-expect-error` and `@ts-nocheck` are forbidden. If a type cannot be expressed, define the interface rather than escaping the type system.
2. `await request.json()` returns `any`. Its result must never flow into domain code. Parse it through a Zod schema in the same statement and use the inferred type from that point onward.
3. Silent failure is forbidden. Every failure path returns a typed error or throws a typed exception. Never swallow a rejected promise. Never return a default value in place of an error.
4. Every numeric value carries a declared unit in its identifier. Examples of correct identifiers: `areaM2`, `supplyCfm`, `deltaTF`, `capacityTr`, `unitPricePhp`. Bare identifiers such as `area`, `temp`, `flow` are rejected in review.
5. Unit conversion is explicit and centralised. Conversion happens only inside a named conversion function. Inline multiplication by a magic conversion factor is rejected.
6. Every division whose denominator originates outside the function must be guarded before the division executes. Denominator equal to zero, negative where physics forbids it, `NaN`, `undefined` or `null` must produce a typed error, never `Infinity`.
7. Route handlers contain HTTP concerns only. Authentication check, schema parse, delegation to a service, status mapping. Business rules and persistence belong in `src/lib/firebase/*-store.ts` or `src/lib/engine`.
8. Use early returns. Do not nest beyond two levels of conditional depth inside a handler.
9. Tailwind arbitrary values are banned unless no design token exists. Use the token scale first.
10. Firestore access is batched or read minimised. A security rule or a service function that issues one document read per result row is a defect, not a style preference.

---

## 3. Architecture map

```
src/app/api/**/route.ts     HTTP boundary only. Auth, parse, delegate, map status.
src/lib/validation/*.ts     Zod schemas. Single source of truth for request shapes.
src/lib/firebase/*-store.ts Persistence layer. All Firestore reads and writes.
src/lib/engine/**           Pure domain calculation. No IO. No Firebase imports.
src/lib/functions/**        Domain helpers, psychrometrics, cost, compliance.
src/stores/**               Zustand client state.
services/calc-engine        Python calculation service.
services/cfd-solver         Python CFD service.
config/firebase             Firestore rules and indexes.
```

Dependency direction is strictly one way. `src/lib/engine` must not import from `src/lib/firebase` or from `src/app`. If a task appears to require that import, the design is wrong. Stop and report the conflict rather than adding the import.

---

## 4. Required workflow for every task

Execute in this order. Do not skip steps.

1. State the mechanism. Before writing code, state in one or two sentences the design pattern, physical law or mathematical identity the change relies on.
2. Outline the exact sequence of file edits before the first edit.
3. Make the change.
4. Run `npx tsc --noEmit`.
5. Run `npx eslint src`.
6. Run `npx vitest run`.
7. Report the before and after numbers for each gate.

If any gate is red after step 6, fix it in the same task. Do not defer.

---

## 5. Command reference

Cross platform commands. Prefer these over the `npm run` aliases, because most aliases in `package.json` shell out to PowerShell and fail on Linux, macOS and Ubuntu CI runners.

```bash
npx next dev --turbopack      # dev server
npx tsc --noEmit              # type gate
npx eslint src                # lint gate
npx vitest run                # test gate
npx next build                # build gate
npm audit --audit-level=moderate
```

---

## 6. Testing standard

1. Every new engine function ships with a unit test in a sibling `__tests__` directory.
2. Every guard clause added under rule 6 of section 2 ships with a test that drives the guard, meaning a test that supplies zero, negative and non finite input and asserts the typed error.
3. Money path changes require a golden test. The existing golden test lives at `src/lib/engine/__tests__/golden-money-path.test.ts`. Extend it rather than creating a parallel fixture.
4. Test names describe the physical or business condition, not the function name.

---

## 7. Prohibited actions without explicit approval

1. Do not commit anything under `.logs`. Do not commit `firestore-debug.log`.
2. Do not add a dependency without stating the size cost and the alternative that was rejected.
3. Do not modify `config/firebase/firestore.rules` without adding a matching rules test.
4. Do not weaken a gate to make a task pass. Raising a bundle budget, lowering an audit level or adding a lint disable comment counts as weakening a gate.
5. Do not create a new planning document. Update `REMEDIATION_PLAN.md`.

---

## 8. Domain constraints for HVAC calculations

1. Sensible heat relation in IP units uses the coefficient 1.08 for standard air at sea level. Latent heat uses 0.68. Total heat uses 4.5. State which one applies and why before using it.
2. Cooling capacity conversion is 12000 Btu per hour per ton of refrigeration. This conversion belongs in one named function.
3. Airflow velocity in feet per minute equals volumetric flow in cubic feet per minute divided by duct cross sectional area in square feet. Area zero is a physical impossibility and must be rejected before division.
4. Equipment quantity derived from required capacity divided by unit capacity must reject unit capacity of zero or below. An unbounded quantity propagates into the bill of quantities and corrupts the price total.
5. Safety factor and diversity factor are dimensionless multipliers. Both must be validated to a finite positive range before use. A diversity factor above one is physically valid only in specific documented cases and must be flagged.
6. Negative absolute temperature in Kelvin or Rankine is a physical impossibility. Reject it at the boundary.
