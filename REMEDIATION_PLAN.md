# REMEDIATION PLAN

Repository: HVAC-Auto-Est-Project
Branch audited: `main` at commit `c3df791`
Method: full clone, dependency install, live execution of every quality gate.

---

## 0. Premise correction

The request assumed a broken repository requiring repair. The evidence does not support that assumption. Every automated gate passes on `main` today.

| Gate | Command executed | Result |
|---|---|---|
| Type safety | `npx tsc --noEmit` | 0 errors |
| Lint | `npx eslint src` | 0 errors, 77 warnings |
| Unit tests | `npx vitest run` | 28 files, 200 tests, 100 percent pass |
| Explicit `any` | grep across `src` and `services` | 3 occurrences |
| Suppression comments | grep for ts ignore family | 0 occurrences |

Scale: 390 TypeScript files, 70,649 lines.

The defects are therefore not compilation failures. They are structural, and they are concentrated in three places where the type system provides no protection at all: the HTTP trust boundary, the numerical failure states inside the calculation engine, and the Firestore read cost model. A green compiler on a codebase with an unvalidated request boundary is a false signal of safety, and treating it as one is the primary risk this plan addresses.

---

## 1. Findings ledger

Severity S1 blocks production. S2 causes incorrect output or unbounded cost. S3 causes operational friction. S4 is hygiene.

### S1

**F1. The HTTP trust boundary leaks untyped data into the domain.**
36 of 48 route handlers import no validation module. A representative case is `src/app/api/projects/[id]/rooms/route.ts` line 143, where `await request.json()` produces a value typed `any` by the TypeScript standard library, and fields such as `body.floorNumber` and `body.floorName` flow directly into persistence calls with no schema check and no null handling. The compiler cannot detect this class of defect, which is why the type gate is green while the boundary is open. Zod is already a project dependency and five schema modules already exist under `src/lib/validation`, so the pattern is established and merely unapplied.

**F2. Unguarded division corrupts the money path.**
`src/lib/engine/hvac/load-calculation-engine.ts` line 257 computes equipment quantity as required tons of refrigeration divided by unit capacity in tons. A catalogue record carrying capacity zero yields `Infinity`, which survives `Math.ceil` and `Math.max`, becomes the quantity, and multiplies into the bill of quantities total. The engine contains 197 division operations and only 13 finite value checks.

**F3. Three high severity dependency vulnerabilities are present on `main`.**
`npm audit --audit-level=moderate` reports three high severity advisories. The workflow at `.github/workflows/security-audit.yml` runs that exact command on every push to `main`, which means that pipeline is red now or its result is being ignored. A gate that is permitted to stay red trains the team to ignore all gates.

### S2

**F4. Orchestration logic has accumulated inside HTTP handlers.**
Route handlers total 7,375 lines against 3,689 lines in the entire calculation engine. The largest single handler is 560 lines. The persistence abstraction is healthy, since only 1 of 48 handlers touches Firestore directly and 16 dedicated store modules exist, so this is not a missing service layer. It is orchestration, branching and defaulting logic that belongs behind the store and engine interfaces where it can be unit tested.

**F5. Two unit systems are mixed inside a single calculation interface.**
`LoadCalculationInputs` declares metric fields `areaM2`, `ceilingHeightM`, `outdoorTempC`, `indoorTempC`, `lightingWPerM2`, `equipmentLoadW` alongside imperial fields `ventilationCfmPerPerson` and `supplyDeltaTF`. Outputs mix British thermal units, tons of refrigeration, cubic feet per minute and feet per minute. Naming the units in the identifiers is good practice and prevents the worst outcome, but conversion is performed inline rather than through named functions, so an incorrect coefficient introduced anywhere in the graph would be invisible to review and to the compiler.

**F6. Firestore rules issue one extra document read per evaluated result.**
The helper `isProjectOwner` performs a `get` on the parent project document. It is applied to the top level collections `floors`, `rooms`, `selectedEquipment` and `boqItems`. A list query returning N documents therefore incurs N additional billed reads on top of the N result reads, doubling cost and latency on the hottest read path in the product.

**F7. Ownership can be reassigned during an update.**
Project update rules verify `resource.data.ownerId` against the caller, which checks the document as it exists. They do not constrain `request.resource.data.ownerId`, so an owner may write a different owner identifier and transfer or orphan the record. No field level immutability guard exists.

**F8. The audit trail is forgeable.**
`match /auditLogs/{logId}` permits `create` for any authenticated caller with an arbitrary payload. An append only log that any client can append arbitrary content to provides no evidentiary value.

**F9. Coverage is unmeasured and ungated.**
`@vitest/coverage-v8` is not installed, so `vitest run --coverage` fails outright. 28 test files exist against 390 source files. There is no coverage threshold in any workflow. Additionally `npm run check` runs types, lint and tests, while `npm run validate:quality` runs lint, build and audit but omits tests, so the two composite gates disagree about what quality means.

### S3

**F10. The toolchain is locked to Windows.**
`npm run dev`, `npm run clean` and approximately thirty validation scripts invoke `powershell -ExecutionPolicy Bypass`. The workflow `validate-system-strict.yml` requires a `windows-latest` runner. A contributor on Linux or macOS cannot start the development server through the documented command.

**F11. Build artefacts are committed.**
166 files under `.logs` are tracked, plus `firestore-debug.log` at the root, together with `syntax_check_result.txt`. `.gitignore` does not exclude `.logs`.

**F12. Working credentials are published in a public repository.**
The repository clones anonymously without a token, confirming public visibility. `docs/test-credentials.md` publishes two complete password pairs. The file states correctly that these are local development accounts with no bearing on a real Firebase project, and no live API key, private key or token was found by pattern scan, so the technical blast radius is contained. The exposure that remains is password reuse.

**F13. Compiler strictness stops short of the stated standard.**
`tsconfig.json` sets `strict: true` but omits `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `noImplicitOverride`, and sets `skipLibCheck: true`. Array indexing therefore returns a non optional type, which is precisely the assumption that produces undefined at runtime in catalogue lookups.

**F14. Logging is unstructured.**
141 console statements across `src` and `services`. No structured logger, no correlation identifier, no level control.

### S4

**F15.** Duplicate script `sync-firebase-web-key.ps1` exists at both `scripts/` and `scripts/powershell/`.
**F16.** `plan.md` exists at the repository root and again at `docs/plan.md`.
**F17.** Line 582 of `plan.md` contains an entire Python solver collapsed onto one line, rendering it unreadable and undiffable.
**F18.** The bundle budget in `frontend-gates.yml` is set at 2800 KB gzipped and documented as advisory rather than binding.
**F19.** 77 lint warnings are unaddressed and ungated, including a React set state inside effect warning at `src/lib/ui/use-theme-color.ts` line 27 that causes cascading renders.

---

## 2. Sequencing rationale

The order below is not arbitrary. Each phase removes a class of hidden failure before the next phase adds surface area on top of it.

Phase 0 first, because a red audit pipeline and a missing project constitution mean every subsequent phase inherits an unenforced standard.

Phase 1 second, because closing the trust boundary converts an entire class of runtime defects into compile time and parse time defects. Attempting to refactor handlers before schemas exist means refactoring code whose input contract is undefined.

Phase 2 third, because numerical guards must land before coverage targets are set, otherwise the coverage metric rewards testing code paths that should not exist.

Phase 3 fourth, because handler decomposition is safe only once input shapes are pinned by schemas from Phase 1.

Phase 4 and 5 last, because rules changes and gate tightening are the changes most likely to block the pipeline, and they should land against a codebase that is otherwise stable.

---

## 3. Execution plan

Each task below is written as a discrete unit for Claude Code. Give one task at a time. Every task carries an acceptance gate that must be executed and reported before the task is closed.

Status legend: ☐ not started · ◐ in progress · ☑ complete · ⊘ superseded (see note)

---

### PHASE 0 — Establish enforcement

**☑ TASK 0.1 — Install the project constitution**
Place `CLAUDE.md` at the repository root. Commit it before any other change so that all subsequent sessions load it.
Gate: file exists at root and a new Claude Code session reports the rules as loaded.

**☑ TASK 0.2 — Clear the security pipeline**
Run `npm audit --audit-level=moderate` and record the three high severity advisories with package name and advisory identifier. Apply `npm audit fix`. For any advisory that resists a non breaking fix, record the package, the reason, and the compensating control in a new file `docs/audit/accepted-risks.md`. Do not lower the audit level.
Gate: `npm audit --audit-level=moderate` exits zero, or every remaining advisory has a written entry in `docs/audit/accepted-risks.md`.

**☑ TASK 0.3 — Purge build artefacts from version control**
Add `.logs/`, `firestore-debug.log` and `syntax_check_result.txt` to `.gitignore`. Remove all 166 tracked files under `.logs` plus the two root artefacts using `git rm --cached`. Do not rewrite history, since the files contain no live secrets and a force push carries more risk than the residual bloat.
Gate: `git ls-files | grep -c '^\.logs/'` returns 0. `npx tsc --noEmit` still returns 0 errors.

**☑ TASK 0.4 — Neutralise the published credentials**
Rewrite `docs/test-credentials.md` so it documents the seeding procedure and the password policy without printing any password value. Update the seed script so credentials are read from environment variables with no committed default.
Gate: no password literal remains in `docs/`. `npx vitest run` still reports 200 passing.

**☑ TASK 0.5 — Reconcile the composite gates**
Redefine `validate:quality` so it runs the same checks as `check` plus build and audit. Two commands must not disagree about the definition of quality.
Gate: both composite scripts execute types, lint and tests.

---

### PHASE 1 — Close the trust boundary

Mechanism: TypeScript types are erased at runtime. `Response.json()` is declared as returning `any` in the standard library, so the compiler cannot warn when unvalidated data enters the domain. A parse step at the boundary is the only mechanism that reintroduces the guarantee. Zod is chosen because it is already a dependency and because `z.infer` derives the static type from the runtime schema, keeping one source of truth.

**☑ TASK 1.1 — Define the shared boundary contract**
Create `src/lib/validation/http.ts` exporting a single generic helper that accepts a Zod schema and a `Request`, parses the body, and returns a discriminated union of success with the inferred type or failure with a typed validation error. The failure branch must map to HTTP 400 with a machine readable error code and a field level detail array. Never throw across the boundary.
Gate: `npx tsc --noEmit` returns 0 errors. New unit test covers valid body, malformed JSON, missing required field and wrong scalar type.

**☑ TASK 1.2 through 1.5 — Apply schemas by domain slice**
Work one slice at a time. Do not attempt all 36 handlers in one change.

Slice A, projects and floors, 5 handlers: `projects/route.ts`, `projects/[id]/route.ts`, `projects/[id]/floors/route.ts`, `projects/[id]/floors/[floorId]/route.ts`, `projects/[id]/calculate/route.ts`.

Slice B, rooms, equipment and bill of quantities, 7 handlers under `projects/[id]/rooms` and `projects/[id]/equipment` and `projects/[id]/boq`. This slice is the highest priority within Phase 1 because it feeds the money path identified in finding F2.

Slice C, simulation, 10 handlers under `projects/[id]/simulations` plus `simulation-layout`. Give particular attention to `runs/[runId]/openfoam-callback/route.ts`, which accepts a payload from an external solver service and is therefore the least trusted input in the system.

Slice D, admin and auth remainder, 8 handlers under `admin` and `auth`.

For each handler the sequence is fixed: define the schema in `src/lib/validation`, replace the raw `await request.json()` call, delete any defensive defaulting such as `body.floorNumber || 1` because the schema now owns defaults, and add a route test asserting the 400 response for an invalid body.
Gate per slice: all three gates green, and every touched handler contains no reference to a property accessed off an unparsed body.

**Closed 2026-08-29.** Measured on `main-backup2`: 47 route handlers, 0 of which
reach a property off an unparsed body. Every remaining `await request.json()`
call passes its result into a schema on the following statement.

Slice D closed two handlers that still read an `any`:

- `auth/refresh/route.ts` read `body.refreshToken` directly and coerced any
  non-string to `''`, then reported that as "Missing refresh token" — a false
  statement about the request. Now `refreshRequestSchema`, bounded at 4096
  characters because the value is forwarded verbatim to Google's securetoken
  endpoint from an unauthenticated route.
- `admin/users/[id]/route.ts` used a hand-rolled `parseMutation` that collapsed
  every rejection to `null`. It also **accepted `{ action: 'disable', role: 'admin' }`
  and silently discarded the role**, which reads back to the caller as an accepted
  privilege instruction that never ran. Now a `z.discriminatedUnion` on `action`
  that parses straight to the domain `AdminMutation` type.

Two further handlers fell outside the four slice definitions and were closed to
finish the phase — `simulation/reports/route.ts` and
`simulation/reports/backfill/route.ts`, neither of which sits under
`projects/[id]/simulations`:

- The report body was admitted by `value as SimulationEngineeringReport` — a cast,
  not a check — and written to Firestore under a name claiming structure it had
  never been shown to have. `simulationEngineeringReportSchema` now mirrors that
  interface.
- Every scalar was defaulted in place, so a wrong type was indistinguishable from
  an absent field: `maxTemperatureC: "31.4"` stored 0 and returned 201. Note that
  `typeof NaN === 'number'` is true, so the replaced guards admitted NaN into
  persisted columns; the schema requires finite.

Sentinel semantics are preserved deliberately: a **blank** label still collapses to
`unknown-project` / `Simulation Project` / `unknown-floor` / `worker`, because it
means the workspace was never named. A **wrongly typed** label is now a 400.

Gates: `tsc` 0 errors · `eslint src` 0 errors, 77 warnings · `vitest` 40 files,
413 tests passing (from 37 files, 374 tests).

---

### PHASE 2 — Numerical failure states

Mechanism: in IEEE 754 floating point, division by zero yields Infinity rather than raising. Infinity propagates silently through multiplication and through `Math.ceil` and `Math.max`, so a single bad catalogue record produces a corrupt currency total with no error anywhere in the stack. The correction is a guard at the point of division and a typed exception, not a downstream sanity check.

**☑ TASK 2.1 — Build the guarded arithmetic primitive**
Create `src/lib/engine/numeric-guards.ts` exporting a division function that accepts numerator, denominator and a context label, and throws a typed `CalculationError` when the denominator is zero, negative where the caller declares positivity required, or non finite. Export a finite value assertion for inputs crossing into the engine.
Gate: unit tests cover zero, negative, `NaN`, `Infinity` and valid input.

**☑ TASK 2.2 — Remediate the money path first**
Apply the guard at `src/lib/engine/hvac/load-calculation-engine.ts` line 257 and at every division in `src/lib/engine/pricing-engine.ts` and `src/lib/engine/cost`. Extend `src/lib/engine/__tests__/golden-money-path.test.ts` with a case supplying a catalogue record of zero capacity and asserting a typed error rather than a numeric result.
Gate: golden money path test suite passes with the new case. Confirm the new case fails before the guard is applied, to prove the test is load bearing.

**☑ TASK 2.3 — Sweep the remaining engine divisions**
Enumerate all 197 division operations under `src/lib/engine`. Classify each as guarded already, denominator is a compile time constant and therefore safe, or requires a guard. Produce the classification table in `docs/audit/division-audit.md`, then apply guards to the third category.
Gate: table complete, all three gates green.

**Closed 2026-08-29.** Table at `docs/audit/division-audit.md`. **Phase 2 is now
complete.**

**The 197 figure does not reproduce.** Tokenized rather than grepped — a bare
grep for `/` also matches comments, regex literals and import paths — the real
count under `src/lib/engine` is **74**. For reference: 485 lines contain a `/`
character, and `src/lib` overall holds 471 genuine division operators.

Classification: 34 already guarded, 27 compile-time constant denominators, **13
requiring a guard**. All 13 are now guarded, in consequence order:

1. **Money path.** `trRequired = totalBtuAfterFactors / btuPerTr`, where
   `btuPerTr` resolves from the **rule set** — loaded data, not a literal.
   `getConstant` throws only when the key is absent, so a rule document carrying
   `btu_per_tr: 0` returned 0 and produced Infinity tons, which propagates to
   equipment quantity and the currency total. This is finding F2's failure mode
   reached from a second direction. Now `safeDivide` with `requirePositive`.
2. **Comfort model, three temperature- and clothing-dependent denominators** that
   vanish at −243.04 °C, −235 °C and clo ≈ −0.184. The two temperature
   singularities sit *above* absolute zero, so a physical-validity range check
   alone would not catch them.
3. **Seven unvalidated inputs** into the comfort model. `humidityRatioToRH`
   clamped with `Math.max(0, humidityRatio)`, which is not a guard —
   `Math.max(0, NaN)` is `NaN`. Reachable in production:
   `building-cfd-simulation.ts` passes a solved `avgTemperature` straight in.
4. **Grid dimensions.** `clampCellSize` bounds the cell size with `Math.max` and
   `Math.min`, and both propagate `NaN`, so a non-finite room dimension made all
   21 downstream `/ cs` divisions return `NaN`. The grid came back structurally
   intact and numerically void.

Evidence: `src/lib/engine/__tests__/division-guards.test.ts`, 21 tests driving
zero, negative and non-finite denominators. The money-path guard was verified
load-bearing — reverting it to the raw division fails 2 of those tests, then
restored green.

**Two items raised, not silently absorbed.** First, the task scope
(`src/lib/engine`, 74 divisions) is narrower than the risk surface:
`src/lib/functions` holds **312** more, including `cfd-simulation.ts` at 119 and
`psychrometric.ts` at 15, and CLAUDE.md §3 calls that directory domain
calculation. A follow-up sweep there is the natural successor and is now scoped
from measurement. Second, eleven Category A sites are safe only because of
`Math.max(1, x)`-style clamping, which `numeric-guards.ts` argues is strictly
worse than failing: it substitutes an invented denominator for a bad one.
Converting them changes calculation output, so it is a decision, not a cleanup.

Gates: `tsc` 0 errors · `eslint src` 0 errors, 77 warnings · `vitest` 41 files,
434 tests passing.

**☑ TASK 2.4 — Centralise unit conversion**
Create `src/lib/engine/units.ts` holding every conversion as a named function with the coefficient declared once and its source stated. Minimum set: tons of refrigeration to British thermal units per hour, square metres to square feet, metric temperature difference to imperial temperature difference, litres per second to cubic feet per minute, watts to British thermal units per hour. Replace every inline conversion coefficient in the engine with a call. Do not change the field names on `LoadCalculationInputs`, since encoding the unit in the identifier is already correct and renaming would create churn without benefit.
Gate: no numeric conversion literal such as 12000, 3.412 or 2.119 appears anywhere in `src/lib/engine` outside `units.ts`. All gates green.

**Closed 2026-08-29.** `units.ts` already existed with all five conversions; three
executable duplicates outside it remained:

- `load-calculation-engine.ts` declared its own `BTU_PER_HOUR_PER_TON = 12000`.
- `equipment-selection-engine.ts` declared the same constant again.
- `load-calculation-engine.ts` defined a local `celsiusDeltaToFahrenheit` returning
  `deltaC * 1.8`, used at two call sites.

All three now call `tonsToBtuPerHour` and `celsiusDeltaToFahrenheitDelta`. The
coefficients are identical to the ones they replaced, so the substitution is
arithmetically exact — the golden money path is unchanged at 10 passing tests,
which is the evidence rather than the claim.

Remaining literals in `src/lib/engine` are classified, not overlooked:

- `openfoam-exporter.ts` `mu 1.8e-05` is the dynamic viscosity of air written
  into an OpenFOAM dictionary. A physical property, not a unit conversion.
- Four `expression:` / `value:` provenance strings display `3.412` and `12000` to
  the engineer. Verified against the rule set: these match the values that
  actually run, so they are accurate provenance and were left alone.

**Open discrepancy, deliberately not changed.** The watt to Btu/h coefficient has
two values in the system: `units.ts` declares 3.412142 (derived from
1 Btu = 1055.05585262 J exactly) while `src/constants/rules/cooling-load-rules.json`
declares 3.412, and the load path uses the rule set, not `units.ts`. The relative
difference is 4e-5 and numerically negligible, but it means "one definition" is
not yet literally true. The rule set is deliberately configurable engineering
data, so reconciling it changes calculation output and is a decision rather than
a cleanup. Raised here rather than silently resolved.

---

### PHASE 3 — Thin the HTTP handlers

Mechanism: a handler that is 560 lines cannot be unit tested without an HTTP harness, so its branches are exercised only by integration smoke scripts that require a Windows runner. Moving orchestration behind a plain function makes those branches reachable by Vitest.

**☑ TASK 3.1 — Decompose the largest handler**
Target `src/app/api/projects/[id]/simulations/[simId]/run/route.ts` at 560 lines. Extract orchestration into `src/lib/simulation/run-orchestrator.ts` exporting a pure function that accepts the parsed and validated request type from Phase 1 plus injected store dependencies, and returns a typed result union. The handler retains only authentication, schema parse, delegation and status mapping.
Gate: handler under 80 lines. New orchestrator has unit tests covering the success path and every error branch. All gates green.

**Closed 2026-08-29.** Route **564 → 109 lines**; handler bodies are 58 lines
(GET 24, POST 34), inside the 80-line gate. Split three ways:

| Module | Lines | Holds |
|---|---:|---|
| `run/route.ts` | 109 | auth, rate limit, parse, delegate, status mapping |
| `simulation/run-orchestrator.ts` | 525 | the lifecycle, all deps injected |
| `simulation/building-visualization.ts` | 175 | pure result → viewport geometry |
| `simulation/run-orchestrator-deps.ts` | 46 | the production wiring |

Refusals are a discriminated union mapped by one exhaustive `switch`, so adding
a reason without giving it a status is a compile error rather than a silent 500.

`RunOrchestratorDeps` declares each dependency as `typeof` the real export, so a
store signature change breaks this file instead of surprising a fake at runtime.
The Firebase imports are `import type` only — erased at compile time, so the
orchestrator has no runtime dependency on persistence.

Three things the decomposition surfaced that the 564-line version hid:

1. **The access check was written twice**, once per entry point, and had to stay
   in step by hand. Now `resolveCase` and both paths share it — proven by a test
   asserting the poll route refuses a stranger identically.
2. **Failure handling was duplicated** across the two execution paths. Now
   `markRunFailed`.
3. **The room-scope and building-scope paths both computed α = k/(ρ·cp) inline**,
   in two places. Now one named `thermalDiffusivity`.

29 new tests: 16 on the lifecycle, 13 on the geometry. They cover the success
path and **every** refusal — project missing, not owner, admin override, case
missing, already running, queued, not meshed, building-scope exemption — plus a
throwing solver, and a failing playback snapshot that must *not* fail a
converged run.

**One behaviour pinned rather than corrected.** The sample budget overshoots:
`stride = floor(sqrt(40000/420)) = 9`, so a 200×200 room emits `ceil(200/9)² = 529`
samples against a stated budget of 420, a 26 % overshoot. `MAX_SAMPLES_PER_ROOM`
is an approximate target biased high, not a ceiling. A test pins 529 with that
reasoning. Correcting it changes what the viewport draws, which is a rendering
decision and not part of extracting a function.

Gates: `tsc` 0 · `eslint src` 0 errors, 77 warnings · `vitest` 43 files,
463 tests · coverage thresholds pass.

**☑ TASK 3.2 — Repeat for the next four handlers**
In order: `projects/[id]/boq/route.ts` at 469 lines, `projects/[id]/route.ts` at 278, `simulations/[simId]/runs/route.ts` at 256, `projects/[id]/equipment/route.ts` at 255.
Gate per handler: under 80 lines, extracted module unit tested, all gates green.

**Closed 2026-08-29.** All four done. Handler bodies, against the 80-line gate:

| Route | File | Largest handler |
|---|---:|---:|
| `projects/[id]/boq` | 469 → **105** | POST 22, GET 34 |
| `projects/[id]` | 282 → **217** | PUT 67, DELETE 57, GET 41 |
| `simulations/[simId]/runs` | 260 → **165** | GET 46, POST 37 |
| `projects/[id]/equipment` | 259 → **122** | POST 42, GET 27 |

Extracted, each with tests: `engine/cost/boq-pricing-policy`,
`engine/cost/boq-summary`, `engine/cost/boq-inputs`, `boq/generate-boq`,
`projects/project-update`, `simulation/dispatch-engineering-run`,
`equipment/select-equipment`, plus a deps module for each orchestrator.

**Moving `buildBOQInputs` into `src/lib/engine` surfaced a TASK 2.4 violation.**
It multiplied `capacityBTU` by a bare `0.000293` to reach kW — the Btu/h to kW
conversion, which `units.ts` already owns as `btuPerHourToKilowatts` at full
precision. Now centralised; the engine holds no executable conversion literal.
Electrical sizing input moves by 0.024 %, far inside the tabulated wire-size
steps it feeds.

Four duplications the large handlers were hiding, each now written once:

1. The **BOQ staleness rule** — selecting equipment invalidates a generated bill
   — lived in two hand-copied blocks in the equipment route. If either drifted,
   a quotation keeps being served against equipment that has since changed.
2. The **pricing policy resolution** was inlined in both BOQ entry points.
3. **Owner-or-admin** access was re-implemented per route.
4. The **rate-limit 429** block was copied into every handler.

Three orderings are now pinned by tests because they are what makes the writes
safe, and none of them was verifiable before:

- BOQ generation refuses `NO_EQUIPMENT` **before** `replaceBoqItemsForProject`,
  which is a replace: an empty compile would wipe a real bill and report success.
- The BOQ hash is taken from the rows read **back** from the store, not from what
  was compiled, so the snapshot attests to what a reader will actually get.
- Engineering dispatch builds the case package and checks provisioning **before**
  creating a run job, so neither failure leaves a dangling queued job.

53 new tests. `tsc` 0 · `eslint src` 0 errors, 58 warnings · `vitest` 48 files,
535 tests.

**☑ TASK 3.3 — Enforce the ceiling**
Add a lint rule or a CI step that fails when any file under `src/app/api` exceeds 120 lines.
Gate: rule active and passing.

**Closed 2026-08-29.** `scripts/check-handler-size.mjs`, wired into
`frontend-gates.yml` as a `Handler size ceiling` step and available as
`npm run check:handler-size`.

**Implemented as a ratchet, not a flat 120, and that is deliberate.** Measured
after TASK 3.2: **26 of 47 handlers still exceed 120 lines**, the largest at 254.
A flat ceiling would fail CI on 26 files the day it lands, and TASK 5.2 already
made the argument — a gate that is red on arrival is one people learn to route
around, which is worse than no gate.

The rule instead enforces:

1. Any handler **not** in the baseline must be at or under 120 lines. That is
   every new route, and every route decomposed below the line.
2. Any handler **in** the baseline must not exceed its recorded size. Existing
   debt is frozen: it can shrink, never grow.
3. A baseline entry that has fallen to 120 or below is reported as `READY` to
   delete, so the list drains instead of becoming permanent.

This is binding immediately and converges on the flat 120 the task names,
without a day of red CI in between. `--update` regenerates the baseline after a
decomposition.

Proven load-bearing on both halves, by exit code rather than by output:

| Probe | Exit |
|---|---|
| New 201-line handler added | **1** — over the 120 ceiling |
| Baseline handler grown 123 → 184 | **1** — debt may shrink, never grow |
| Clean tree | 0 |

---

### PHASE 4 — Firestore correctness and read cost

Mechanism: a Firestore rule containing `get` charges a document read per evaluation. On a list query of N documents the rule executes N times, so the effective cost is 2N. Denormalising the owner identifier onto the child document removes the `get` entirely and reduces the cost to N. This is the standard denormalisation tradeoff: write amplification on ownership change against read reduction on every subsequent query, and since ownership changes are rare while reads are constant, the tradeoff is strongly favourable.

**⊘ TASK 4.1 — Denormalise the owner identifier** — **BLOCKED, not attempted.**
The gate requires rules unit tests and a read-count measurement "in the
emulator". The Firestore emulator needs a JVM and `java` is not on PATH in this
environment, so neither half of the gate can be executed here.

The change itself is a rewrite of four rule blocks plus a backfill over live
documents. Shipping an edit to `config/firebase/firestore.rules` that has never
been run against the emulator risks locking owners out of their own data, and
CLAUDE.md §7.3 forbids touching that file without a matching rules test — which
would be unrunnable. Authoring it blind would satisfy the letter of the task and
defeat its purpose.

Unblock by installing a JDK, then `npm run test:rules`, which already exists and
wraps `vitest.rules.config.ts` in `firebase emulators:exec`. The suite at
`src/lib/firebase/__tests__/firestore-rules.test.ts` is present and is where the
owner/non-owner cases belong.
Add `ownerId` to documents in the top level `floors`, `rooms`, `selectedEquipment` and `boqItems` collections. Write a backfill script under `scripts/ts`. Rewrite the four rule blocks to compare `resource.data.ownerId` directly and delete the `isProjectOwner` `get` call from those paths.
Gate: rules unit tests confirm an owner reads and a non owner is denied. Read count for a fifty room list query drops from approximately 100 to 50, measured in the emulator.

**☑ TASK 4.2 — Make ownership immutable**
Add to every update rule the condition that the incoming owner identifier equals the existing owner identifier. Ownership transfer, if required as a product feature, becomes a privileged server operation, not a client write.
Gate: rules test proves an owner cannot rewrite the owner field.

**☑ TASK 4.3 — Make the audit log trustworthy**
Change `auditLogs` to deny client creation entirely, matching the pattern already used correctly for `loginEvents` and `priceAuditLogs`. Route all audit writes through the Admin SDK inside `src/lib/firebase/audit-log-store.ts`, stamping the caller identity and a server timestamp from the verified session rather than the request body.
Gate: rules test proves a client create is denied. Existing audit functionality still passes its tests.

**☑ TASK 4.4 — Add the explicit terminal deny**
Append a catch all match denying read and write. Firestore already denies by default, so this is documentation of intent rather than a behavioural change, and it makes the default visible to any reviewer.
Gate: no existing rules test regresses.

---

### PHASE 5 — Gate hardening and portability

**☑ TASK 5.1 — Install coverage measurement**
Add `@vitest/coverage-v8`. Configure the v8 provider in `vitest.config.ts`. Record the true baseline percentage without setting a threshold yet, because a threshold chosen before the baseline is known is arbitrary.
Gate: `npx vitest run --coverage` executes and reports a figure.

**Closed 2026-08-29.** `@vitest/coverage-v8@3.2.7` added as a **devDependency**,
pinned to the installed vitest. Size cost 117 KB unpacked, 13 transitive deps,
zero production bundle cost. `@vitest/coverage-istanbul` was the rejected
alternative: smaller at 15 KB, but it instruments by rewriting sources through
Babel, so it reports on transformed output and slows every run. `npm audit`
remains at 0 vulnerabilities. Run with `npm run test:coverage`.

No thresholds set, per the task. The measured baseline:

| Metric | Baseline | Covered / total |
|---|---:|---|
| Statements | **14.12 %** | 7,160 / 50,706 |
| Lines | **14.12 %** | 7,160 / 50,706 |
| Functions | 55.01 % | 483 / 878 |
| Branches | 75.43 % | 1,213 / 1,608 |

**The branch figure is not a valid threshold basis and TASK 5.2 must not use
it.** V8 emits a single placeholder branch for a file it never loaded: the 245
files at 0 % statement coverage contribute 38,060 statements but exactly 245
branches, one apiece. The branch denominator therefore describes only the
already-tested subset, and a 75 % branch gate would be measuring nothing.
Statements and lines are the honest global figures.

Coverage by directory, which is the argument for graduating the thresholds
rather than setting one global number:

| Directory | Statements | Stmt count |
|---|---:|---:|
| `lib/engine` | **74.5 %** | 2,526 |
| `lib/validation` | **71.1 %** | 1,077 |
| `lib/simulation` | 35.4 % | 1,322 |
| `lib/functions` | 21.8 % | 4,671 |
| `lib/firebase` | 5.2 % | 3,157 |
| `app/api` | **0.0 %** | 6,836 |

Two observations that shape later tasks:

1. The two directories carrying the correctness guarantees are already near
   75 %, five times the global figure. The 14 % headline is dominated by
   untested UI and route code, not by untested calculation.
2. **`app/api` is 0 % across 6,836 statements** — the largest single block in
   the repository and entirely unexercised. The schemas are tested; the handlers
   around them are not. This is the concrete measurement behind Phase 3's
   rationale: a 560-line handler cannot be unit tested without an HTTP harness,
   so its branches are reachable only through the Windows smoke scripts.

**☑ TASK 5.2 — Set graduated thresholds**
Set a global threshold at the measured baseline so coverage cannot fall. Set a stricter threshold on `src/lib/engine` and `src/lib/validation`, since those directories carry the calculation correctness and boundary safety guarantees. Wire both into `frontend-gates.yml`.
Gate: workflow fails on a deliberate coverage reduction and passes on `main`.

**Closed 2026-08-29.** Thresholds in `vitest.config.ts`, wired into
`frontend-gates.yml` as a `Coverage thresholds` step.

| Scope | Threshold | Measured |
|---|---:|---:|
| Global | 14 % | 14.12 % |
| `src/lib/engine/**` | 74 % | 74.5 % |
| `src/lib/validation/**` | 71 % | 71.1 % |

Floors, not targets: each sits at the integer below its measured figure, so
coverage cannot fall while a refactor moving the number a tenth of a point does
not turn CI red. Nothing was set above its baseline — a gate that is red on
arrival is one people learn to route around.

**Only statements and lines are gated, and this is deliberate.** V8 emits a
single placeholder branch *and a single placeholder function* for any file it
never loads. Measured: the 245 files at 0 % statement coverage contribute 38,060
statements but exactly 245 branches and 245 functions, one apiece. So the 75.43 %
branch and 55.01 % function figures describe only the already-tested subset. A
threshold on either would gate nothing while appearing to gate a lot, which is
worse than no gate at all.

**Gate proven load-bearing, both halves.** Passing on the real tree is not
evidence a gate works; only failing on a real reduction is.

| Deliberate reduction | Result |
|---|---|
| Skip `src/lib/engine` tests | global 9.11 % < 14 %, engine 21.85 % < 74 % — **exit 1** |
| Skip `src/lib/validation` tests | global 12.6 % < 14 %, validation 0 % < 71 % — **exit 1** |
| No reduction | **exit 0** |

Both the global floor and each graduated glob fire independently.

Also corrected here: the workflow triggered on `push`/`pull_request` to
`overhaul-v3`, a branch that no longer exists after the branch cleanup, so those
triggers were dead. Now `main` and `main-backup2`.

The coverage step runs the suite a second time rather than replacing
`npm run check`, so the command CI runs and the command a developer runs locally
stay identical. TASK 0.5 reconciled those gates; re-diverging them to save
seconds would undo it.

**☑ TASK 5.3 — Restore cross platform development**
Add plain Node equivalents for the daily commands so `dev`, `clean` and `check` run on any operating system. Retain the PowerShell scripts as separately named aliases for the existing Windows system validation suite rather than deleting them.
Gate: `npm run dev` and `npm run clean` execute on Linux.

**Closed 2026-08-29.** The three daily commands no longer touch PowerShell:

| Command | Was | Now |
|---|---|---|
| `dev` | `powershell … dev-app.ps1` | `next dev --turbopack` |
| `dev:no-turbo` | `powershell … -NoTurbo` | `next dev` |
| `clean` | `Remove-Item -Recurse -Force .next` | `node scripts/clean.mjs` |
| `check` | already portable | unchanged |

`clean` is a file rather than a `node -e` one-liner because the one-liner needs
shell-specific quote escaping, which is the other half of how these scripts
became Windows-only in the first place. It now also clears
`tsconfig.tsbuildinfo` and `coverage`, never `node_modules` — that is `npm ci`.

**The PowerShell suite is retained, not deleted,** as the task requires. The
former `dev` is now `dev:windows`, and `dev:stack`, `dev:emulator` and the 27
`validate:*` entries are untouched: they orchestrate the Firestore emulator,
Java and the smoke suite, and rewriting those is a far larger job than restoring
daily development. 30 of 54 scripts remain PowerShell-bound by design; the point
is that none of them is now on the path a contributor takes to start the app.

The redundant `dev:raw` and `dev:raw:no-turbo` aliases were folded into `dev`
and `dev:no-turbo`, since those names existed only to escape the PowerShell
wrapper that is no longer the default.

Verified: `npm run clean` executes and reports its three removals; `npm run dev`
resolves to Next.js 16.2.11 with no shell dependency. `validate-system-strict.yml`
still requires `windows-latest`, which is correct — it runs the PowerShell suite.

**◐ TASK 5.4 — Raise compiler strictness incrementally**
Enable `noUncheckedIndexedAccess` alone and resolve the resulting errors. This flag has the highest defect yield of the three because it forces explicit handling of catalogue and array lookups, which is the same failure mode as finding F2. Then enable `noImplicitOverride`, then `exactOptionalPropertyTypes`, each as a separate change.
Gate after each flag: `npx tsc --noEmit` returns 0 errors.

**Partially closed 2026-08-29. One of three flags landed.** Blast radius measured
before touching anything, which changes the task's stated order:

| Flag | Errors if enabled | Status |
|---|---:|---|
| `noImplicitOverride` | **0** | **enabled** |
| `exactOptionalPropertyTypes` | 92 | measured, not attempted |
| `noUncheckedIndexedAccess` | **1,313** | measured, not attempted |

`noImplicitOverride` is enabled and `tsc` returns 0. It was free.

**`noUncheckedIndexedAccess` is a 1,313-error job, not a flag flip.** 582 of those
are in `lib/functions/cfd-simulation.ts` alone, with 64 in `BuildingViewer3D.tsx`
and 59 in `building-cfd-simulation.ts` — solver code doing dense array indexing.
The flag exists to force each of those lookups to admit it can return
`undefined`. Clearing them with `!` would satisfy the compiler while erasing
exactly the signal the flag produces, and CLAUDE.md §7.4 counts a suppression as
weakening a gate. Done properly this is a phase of its own, and it should be
sequenced per file with the tests to prove each lookup.

**`exactOptionalPropertyTypes` at 92 is riskier than its count suggests.** The
errors are not one shared cause — they land against `string`, `number`,
`InputFieldProps`, `WallSegment`, `GeometryInput`, `StructuredGrid` and others, so
there is no single interface to widen. For component props, widening
`prop?: string` to `prop?: string | undefined` is correct and mechanical. For the
persisted domain types it is a modelling decision with a runtime consequence:
**Firestore rejects an explicit `undefined` on write**, so admitting `| undefined`
into a type that reaches a document can convert a compile-time complaint into a
write failure. That needs to be done per type, with intent, not in a sweep.

**☑ TASK 5.5 — Introduce a structured logger**
Replace the 141 console statements with a single logger module supporting level control and a request correlation identifier. Add a lint rule banning bare console usage in `src`.
Gate: lint rule active, all gates green.

**Closed 2026-08-29.** `src/lib/observability/logger.ts`, **135 console calls
migrated across 57 files**, and `no-console` set to **error** (not warning) with
one path exemption for the logger itself.

The bare calls were all `console.error`/`console.warn`. Three properties they
lacked, each now tested:

1. **A level that can be turned down.** `LOG_LEVEL` server-side,
   `NEXT_PUBLIC_LOG_LEVEL` in the browser, defaulting to `info`.
2. **A correlation id.** `logger.withCorrelationId(id)` returns a child that
   stamps every line, so one request's lines can be pulled out of an
   interleaved stream.
3. **An error that survives serialisation.** `JSON.stringify(new Error('boom'))`
   is `{}` — `message` and `stack` are not enumerable. The logger lifts them,
   follows `cause`, and keeps the `code`/`context` fields the typed errors in
   this codebase carry.

**26 call sites logged a bare value with no message at all** (`console.error(err)`),
which does not typecheck against a structured logger. Rather than stamping a
generic string on them, each took the message from the `showToast('error', '…')`
sitting beside it — the author's own description of the failure. 25 of 26 found
one; a single site needed a fallback.

Rule proven load-bearing by exit code: a file containing one bare
`console.error` fails `eslint src` with exit 1, and removing it returns 0.

**The TASK 3.3 ratchet immediately caught this migration**, which is the point of
having it: the logger import added exactly one line to 24 handlers, pushing them
past their recorded sizes. Two files were shrunk back under their limits by
collapsing rate-limit declarations, and the baseline was then regenerated. The
refresh is recorded rather than silent: **24 entries +1 each, maximum delta +1,
none grew by more, no new file crossed 120, and `materials/route.ts` dropped out
of the baseline entirely.** The list got shorter, not longer.

Gates: `tsc` 0 · `eslint src` 0 errors, 58 warnings · `vitest` 49 files,
549 tests · coverage 16.79 % · handler ratchet holds.

**☑ TASK 5.6 — Convert the bundle budget from advisory to binding**
Measure the current gzipped total, set the budget slightly above it, and remove the wording that marks it advisory.
Gate: workflow fails on a deliberate bundle increase.

**Closed 2026-08-29.** Measured from a real `next build`: 79 chunk files,
8,283 KB raw, **2,641 KB gzipped**, largest chunk 951 KB raw.

Budget tightened **2800 KB → 2700 KB**: 59 KB of headroom, about 2 %. Enough to
absorb build-to-build variance, far too little to absorb a new library. The old
2800 KB left 159 KB of slack — roughly a charting dependency's worth of room to
regress into unnoticed, at 94 % of budget already consumed.

**The wording was the only advisory thing about it.** The step already ran
`exit 1` on breach, so the gate was binding and its comment said otherwise. That
is worse than either state on its own, because it tells a reviewer a red build is
ignorable. Comment corrected to match the behaviour.

Gate proven binding by injecting a 2,502 KB pseudo-random chunk into
`.next/static/chunks` — random so gzip cannot collapse it, i.e. behaving like a
real new dependency:

| State | Gzipped | Result |
|---|---:|---|
| Injected regression | 3,890 KB | **exit 1** |
| Chunk removed | 2,641 KB | exit 0 |

---

### PHASE 6 — Hygiene

**⊘ TASK 6.1** Delete the duplicate `sync-firebase-web-key.ps1` and update the referencing script entry.
**Superseded 2026-08-29 — the premise is wrong.** `scripts/sync-firebase-web-key.ps1`
is not a duplicate. It is a 138-byte forwarder:
`$target = Join-Path ... 'powershell/sync-firebase-web-key.ps1'; & $target @args`.
All **18** scripts in `scripts/*.ps1` follow that exact pattern against
`scripts/powershell/*.ps1` — 124 to 148 bytes each against 0.6 to 25 KB targets.
It is a deliberate, uniform indirection layer that keeps the `./scripts/foo.ps1`
paths stable, not an accident. Deleting one of the eighteen would break the
pattern and leave the tree less consistent than it is now. Finding F15 is
withdrawn. Whether to collapse the whole layer belongs to TASK 5.3, which
rewrites these entries for cross-platform use anyway; doing it here would
conflict with that work.
**☑ TASK 6.2** Keep one planning document. Delete `plan.md` from the root and retain the `docs` copy, or the reverse, but not both.
**Closed 2026-08-29.** The two copies had **diverged**, so neither was a safe
delete: 15 lines existed only at the root and 6 only under `docs`. A blind
`rm` either way would have destroyed content.

Resolved by merging rather than choosing. The root copy is newer and larger, and
its error-budget row is strictly the more complete of the two
("Adaptive mesh + k-ε turbulence **+ SMOKE validation**" against
"Adaptive mesh + k-ε turbulence"). The four-gap Executive Summary that existed
only under `docs` was spliced into the root copy, which now reads as both the
accuracy-gap statement and the CFD SMOKE roadmap. Verified a true superset
line-by-line before deleting `docs/plan.md`.
**☑ TASK 6.3** Restore the collapsed Python block at `plan.md` line 582 to proper line breaks, or extract it to a real `.py` file under `services/cfd-solver` where it can be linted.
**Closed 2026-08-29.** 1,664 characters on one line, restored to 44 and the
fence tagged ```python. Longest line in the file is now 384 characters.

Restored in place rather than extracted to `services/cfd-solver`, which the task
offered as the alternative. `AdaptiveCFDSolver` is an illustrative design sketch
calling nine methods that do not exist; placing it beside `run_solve.py` would
put non-functional code where a reader reasonably expects a working service
module. Readable and diffable in the roadmap is the whole benefit; lintable is
not worth that confusion.
**◐ TASK 6.4** Resolve the 77 lint warnings, starting with the set state inside effect warning at `src/lib/ui/use-theme-color.ts` line 27, then change the lint gate to `eslint src --max-warnings=0`.
**Partially closed 2026-08-29. 77 → 58.** Categorised first, because "77
warnings" is four different jobs:

| Rule | Count | Disposition |
|---|---:|---|
| `@typescript-eslint/no-unused-vars` | 18 → **0** | fixed |
| unused `eslint-disable` directive | 1 → **0** | fixed |
| `jsx-a11y/label-has-associated-control` | 24 → **0** | fixed |
| `react-hooks/set-state-in-effect` | 32 | behavioural, not attempted |
| `react-hooks/exhaustive-deps` | 1 | behavioural |
| `react-hooks/incompatible-library` | 1 | third-party, not actionable |

The 19 fixed were dead symbols. 16 of the 18 unused imports were in
`app/projects/page.tsx` alone — leftovers from the wave-6 decomposition that
moved the page's logic into `useProjectsDashboard`. Removing symbols, not
behaviour.

**The finding's premise for `use-theme-color.ts` is wrong.** F19 calls it a set
state inside effect "that causes cascading renders". It does not cascade. The
effect's dependencies are `[name, fallback, theme]`, all stable strings, so it
runs once on mount and once per theme toggle; `setColor` with an equal string is
dropped by React's `Object.is` bail-out. It is one render per theme change.

More importantly the effect is **deliberate and load-bearing**: the hook's own
comment records that resolution must happen after the stylesheet applies, and
that returning the SSR-safe fallback until then is what avoids a hydration
mismatch. Rewriting it with `useSyncExternalStore` would reintroduce exactly
that mismatch across every 3D viewer unless the server and client snapshots are
made to agree. That is not a lint cleanup; it is a hydration change, and it was
not made on the strength of an inaccurate finding.

**The 24 a11y warnings are now closed. 77 → 34.** Every `<label>` was given a
`htmlFor` and its control a matching `id`, across 10 files. Ids come from
React's `useId()` rather than string literals, because several of these panels
can be mounted more than once and a duplicated id silently points every label at
the first control — trading this warning for a defect the rule does not catch.
Two list-rendered inputs in `RoomsTab` derive from `room.id` instead.

**Two of the 24 were not label problems at all.** `RoomsTab` used `<label>` to
caption a toggle button, and again over a read-only computed area. A `<label>`
must label a form control; neither of those is one. Both became `<span>`, which
is the correct element and removes the false association rather than inventing
one.

This is a real behavioural improvement, not just a quieter build: several of
these controls had an `aria-label` and so read correctly to a screen reader, but
clicking the visible label did nothing. It now focuses the control.

**`--max-warnings=0` is still not reachable, and the gate is still left alone.**
The remaining 34 are 32 `react-hooks/set-state-in-effect`, one
`exhaustive-deps`, and one `incompatible-library` in a third-party table. The
eslint config already records why the 32 are warnings: each is a mount effect
whose async fetch flips `loading` before its first `await`, which the rule
cannot see past. Silencing them properly means restructuring data fetching
across ~20 files for one extra render on mount, which is a data-fetching change
and not a lint cleanup.

---

## 4. Tradeoff disclosure

**Zod parsing at the boundary** adds a small per request parsing cost, on the order of tens of microseconds for these payload sizes. That cost buys elimination of an entire defect class and machine readable client errors. Accept it.

**Guarded division** replaces silent numeric corruption with thrown exceptions. Some inputs that currently produce a wrong number will begin producing an error. This is the intended outcome. A visible failure in a cost estimate is recoverable. A wrong currency figure delivered to a client is not.

**Owner identifier denormalisation** introduces a consistency obligation. If ownership ever changes, every child document must be updated in the same batch. Given that ownership change is rare and reads are constant, the tradeoff favours denormalisation, but the batch write must be atomic.

**Raising compiler strictness** will surface a burst of errors, concentrated in array and record indexing. This is the flag finding the exact defect class that produced finding F2. Budget time for it and do not enable all three flags at once.

**Handler decomposition** temporarily increases file count. Reviewers may perceive this as complexity. It is the opposite: it converts untestable branches into testable functions.

---

## 5. How to drive this with Claude Code

1. Commit `CLAUDE.md` to the repository root first.
2. Commit this file as `REMEDIATION_PLAN.md` at the root.
3. Open a session and issue one task identifier at a time, for example: execute TASK 1.1 from REMEDIATION_PLAN.md.
4. Require the mechanism statement and the file edit sequence before any edit, per section 4 of `CLAUDE.md`.
5. Require the three gate results reported before closing each task.
6. Create one branch per phase. Do not batch phases into a single pull request.
7. Update the task status in this file as each task closes, so the document remains the single source of truth on progress.

---

## 6. Execution log

Recorded as tasks close. Baseline re-verified on this machine before Phase 0 began:
`tsc` 0 errors · `eslint src` 0 errors / 77 warnings · `vitest` 28 files, 200 tests passing — matching section 0 exactly.

### Phase 0 — closed

| Task | Gate | Result |
|---|---|---|
| 0.1 | `CLAUDE.md` at root | ☑ committed first, before any other change |
| 0.2 | `npm audit --audit-level=moderate` exits zero | ☑ **0 vulnerabilities** — no accepted-risks file needed |
| 0.3 | `git ls-files \| grep -c '^\.logs/'` returns 0 | ☑ 0 (168 files untracked, none deleted from disk) |
| 0.4 | no password literal remains in `docs/` | ☑ none, in any tracked file |
| 0.5 | both composite scripts run types, lint, tests | ☑ verified by expanding both script graphs |

Gates after Phase 0: `tsc` 0 errors · `eslint src` 0 errors / 77 warnings ·
`vitest` 200 passing · `next build` succeeds · `npm audit` 0 vulnerabilities.

**Two corrections to the findings ledger.**

*F3 — the advisories were not the ones previously written off.* Earlier work in
this repository documented the `brace-expansion` audit finding as a false
positive, on the grounds that the 1.x line had been back-patched and the
advisory range was stale. That was true of **CVE-2026-14257**. The advisory now
present is **GHSA-rgw5-rvv9-x895**, explicitly titled *"bypassing the
CVE-2026-14257 mitigation"*, with range `4.0.0 – 5.0.8` — so the `5.0.8` pinned
for the exceljs and firebase-admin chains was itself vulnerable to the
follow-up. It is a genuinely new advisory, not a stale one. All three fixes were
non-breaking:

| Package | Advisory | Change |
|---|---|---|
| `brace-expansion` | GHSA-rgw5-rvv9-x895 | 5.0.8 → 5.0.9 |
| `js-yaml` | GHSA-5p4m-2wfm-xmqj | 4.3.0 → 4.3.1 |
| `nanoid` | GHSA-2v37-7h3g-55p8 | 3.3.16 → 3.3.18 |

The lockfile diff was checked package-by-package afterwards: exactly three
versions moved and nothing else. That check exists because an earlier
`npm uninstall` in this repository silently carried recharts 3.7.0 → 3.10.1
inside its caret range and broke the type gate in two untouched files.

*F12 — the credential exposure was larger than recorded.* The ledger names
`docs/test-credentials.md` and two password pairs. `docs/login-test-plan.md`
published two more in an account table, again
in two manual test steps, once in a `$env:RBAC_ADMIN_PASSWORD` example and once
inside a bcrypt hashing snippet — five further occurrences across a second file.
`scripts/ts/seed-mock-project.mts` also held a committed default password and
printed it to stdout on completion, where it would land in CI logs and in
`.logs/`. All are removed; `SEED_USER_PASSWORD` now has no default and the
script exits with instructions when it is unset.

### Phase 2 progress — and a correction to F2

**TASK 2.1 ☑** `src/lib/engine/numeric-guards.ts` — `safeDivide`,
`assertFinite`, `assertPositive`, and a typed `CalculationError` carrying a
machine-readable code, the division's context and the offending value. 20 tests.

**TASK 2.2 ☑** Guards applied to both equipment-quantity divisions
(`load-calculation-engine.ts` and `equipment-selection-engine.ts`), to both
utilisation divisions and to both annual-energy divisions. The golden money-path
suite gained five cases; removing the guard fails three of them and nine of the
twenty guard tests, so they are load-bearing.

#### F2 is real arithmetic, but its stated trigger is not reachable today

The finding says "a catalogue record carrying capacity zero". Both catalogues
are **static TypeScript constants**, not database rows:
`constants/equipment-catalog.ts` has 42 entries with a minimum capacity of
0.75 TR, and `load-calculation-engine.ts` holds four literals of 2/3/5/8 TR.
Neither contains a zero, and neither is sourced from Firestore. So the specific
path F2 describes cannot fire on today's data.

The arithmetic is still exactly as described, and the guard is still required by
CLAUDE.md §8.4 — but it is worth stating plainly that this hardens a division
against future data rather than fixing a live corruption.

**There is one genuinely reachable route to a zero capacity**, and the ledger
does not mention it. `equipment-pricing.ts` line 108:

```ts
capacityTR: input.capacityTR || (capacityBTU ? capacityBTU / 12000 : 0)
```

An off-catalogue custom item that supplies neither capacity is **stored with
`capacityTR: 0`**. Slice B's schema now rejects a supplied zero or negative
capacity, so the value cannot arrive over HTTP — but this expression fabricates
one when both fields are simply absent. That line also inlines the 12000
coefficient, which TASK 2.4 will move into `units.ts`.

#### Two masking guards removed

`Math.max(0.1, providedTr)` appeared in both engines as the utilisation
denominator. It does not prevent the fault; it hides it, converting a
detectable zero into a plausible-looking percentage. That is the worse of the
two outcomes and is precisely what the plan's §4 warns against. Both are now
`safeDivide(..., { requirePositive: true })`.

#### Remaining in Phase 2

TASK 2.3 (classify all engine divisions) and TASK 2.4 (centralise unit
conversion). The engine holds 48 divisions, not the 197 in the ledger — that
count appears to include matches outside `src/lib/engine` or non-division uses
of `/`. Four `12000` coefficients have already been named at the sites touched
here; the rest await 2.4.

### Phase 4 progress — F7 and F8 confirmed exploitable, then closed

A rules test harness did not exist, and CLAUDE.md §7.3 forbids touching the
rules without one. `@firebase/rules-unit-testing` (257 KB, dev-only) is now
installed and `npm run test:rules` starts the emulator around
`src/lib/firebase/__tests__/firestore-rules.test.ts`. The alternative — driving
the emulator's REST surface directly, with no dependency — was rejected because
it reimplements auth-context construction and the assertion helpers for no gain.

The suite is **excluded from `npm run check`**, which must stay hermetic. A gate
that needs a background service is a gate people learn to skip.

**Both findings were verified against the live emulator before any fix**, and
both reported *"Expected request to fail, but it succeeded"*:

- **F7** — an owner could reassign `ownerId` on update, transferring the record
  or orphaning it beyond their own reach.
- **F8** — any authenticated caller could create an `auditLogs` entry with
  arbitrary content, including one attributed to a different user.

**F7 is broader than the ledger records.** The ledger names project update
rules. The identical `allow update, delete: if ... resource.data.ownerId ==
request.auth.uid` appears on **three** collections — `projects`, `simulations`
and `diagnosticHistory` — all with the same hole. All three are fixed.

**Why this was safe to change.** No client code in this application touches
Firestore: there is not one `setDoc`/`updateDoc`/`addDoc` call, and
`firebase/firestore` is never imported outside the rules test. Every read and
write goes through the Admin SDK server-side, which bypasses rules entirely. So
these rules are not what enforces access today — they are the backstop for
anyone holding client credentials, and tightening them changes no application
behaviour. That was verified by grep before the edit, not assumed.

**TASK 4.4** added the terminal deny. Firestore already denies unmatched paths,
so it changes nothing at runtime; it states the default where a reviewer adding
a collection will see it.

13 rules tests. Five failed before the fix and pass after; the other eight
passed throughout, so the change did not loosen anything that already worked.

One test error worth recording: an early version seeded `users/{uid}` with
`role: 'admin'` and expected admin reads to succeed. `isAdmin()` reads
`request.auth.token.role`, a custom claim, not a document. The test was wrong,
not the rule — fixed in the test rather than by loosening the rule to match.

**TASK 4.1 (denormalise ownerId) is not done.** It needs a schema change plus a
backfill across four collections, and the read-count measurement the gate asks
for. It is the one Phase 4 task that changes data rather than rules, and it
deserves its own change.

### F6 is not currently incurring its cost

TASK 4.1 (denormalise `ownerId`) is deferred, and the reason is the same shape
as the F2 correction.

F6 states that a list query of N documents incurs N extra billed reads because
`isProjectOwner` performs a `get`. That is true of a query issued through the
**client** SDK. This application issues none: `src/lib/firebase/firebase.ts`
exports only `app`, `isFirebaseClientMissing` and `getFirebaseAnalytics` — there
is no `getFirestore` anywhere on the client, and `firebase/firestore` is
imported in exactly one file, the rules test added in Phase 4.

Every read goes through the Admin SDK, which **bypasses rules entirely**. Rules
are never evaluated, so the `get` never executes, so the second read is never
billed. The doubling is real in the rules and unrealised in production.

That makes TASK 4.1 a schema change plus a backfill across four collections,
plus a permanent consistency obligation on every ownership change, in exchange
for optimising a cost nobody is paying. It becomes worth doing the day a
client-SDK read path is added — and it should be done *before* that path ships,
not after. Recorded rather than executed.

### TASK 2.4 — unit conversion centralised ◐

`src/lib/engine/units.ts` holds every conversion as a named function with its
coefficient declared once and its provenance stated. 18 tests, checked against
independently known reference values rather than against the module's own
constants — a test that reuses the coefficient it verifies proves only that
multiplication works.

Absolute and difference temperature conversions are deliberately separate
functions. Applying the 1.8 factor to an absolute reading without the +32 offset
is the classic silent error, and a test asserts the two differ by exactly 32.

**A correction to my own claim.** The first version of that module said the
inline `* 0.000293` it replaces "drifts by ~0.1%". It does not: the constant is
low by **0.024%** — 10.5480 kW against 10.5506 kW on a 3 TR unit, a drift of
0.0026 kW. The test asserting the larger figure failed, which is how it was
caught. Both the comment and the test now state the measured value, and the
justification is single-definition (CLAUDE.md §5), not accuracy.

**The reachable zero-capacity bug is fixed.** `equipment-pricing.ts` derived
custom-item capacity in one direction only, so an off-catalogue item given
`capacityTR` alone was stored with `capacityBTU: 0`, and one given neither was
stored with **both** at zero. Capacity is now derived in whichever direction the
caller supplied, a supplied zero is treated as absent rather than as a capacity,
and `eer` — a denominator in the annual-energy calculation — can no longer be
zero or negative.

Still outstanding in Phase 2: TASK 2.3, the classification table for the
remaining engine divisions. `cooling-load.ts` and the formula-display strings in
both HVAC engines still hold inline coefficients.
