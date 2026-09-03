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

**◐ TASK 2.4 — Centralise unit conversion**
Create `src/lib/engine/units.ts` holding every conversion as a named function with the coefficient declared once and its source stated. Minimum set: tons of refrigeration to British thermal units per hour, square metres to square feet, metric temperature difference to imperial temperature difference, litres per second to cubic feet per minute, watts to British thermal units per hour. Replace every inline conversion coefficient in the engine with a call. Do not change the field names on `LoadCalculationInputs`, since encoding the unit in the identifier is already correct and renaming would create churn without benefit.
Gate: no numeric conversion literal such as 12000, 3.412 or 2.119 appears anywhere in `src/lib/engine` outside `units.ts`. All gates green.

---

### PHASE 3 — Thin the HTTP handlers

Mechanism: a handler that is 560 lines cannot be unit tested without an HTTP harness, so its branches are exercised only by integration smoke scripts that require a Windows runner. Moving orchestration behind a plain function makes those branches reachable by Vitest.

**☑ TASK 3.1 — Decompose the largest handler**
Target `src/app/api/projects/[id]/simulations/[simId]/run/route.ts` at 560 lines. Extract orchestration into `src/lib/simulation/run-orchestrator.ts` exporting a pure function that accepts the parsed and validated request type from Phase 1 plus injected store dependencies, and returns a typed result union. The handler retains only authentication, schema parse, delegation and status mapping.
Gate: handler under 80 lines. New orchestrator has unit tests covering the success path and every error branch. All gates green.

**☐ TASK 3.2 — Repeat for the next four handlers**
In order: `projects/[id]/boq/route.ts` at 469 lines, `projects/[id]/route.ts` at 278, `simulations/[simId]/runs/route.ts` at 256, `projects/[id]/equipment/route.ts` at 255.
Gate per handler: under 80 lines, extracted module unit tested, all gates green.

**☐ TASK 3.3 — Enforce the ceiling**
Add a lint rule or a CI step that fails when any file under `src/app/api` exceeds 120 lines.
Gate: rule active and passing.

---

### PHASE 4 — Firestore correctness and read cost

Mechanism: a Firestore rule containing `get` charges a document read per evaluation. On a list query of N documents the rule executes N times, so the effective cost is 2N. Denormalising the owner identifier onto the child document removes the `get` entirely and reduces the cost to N. This is the standard denormalisation tradeoff: write amplification on ownership change against read reduction on every subsequent query, and since ownership changes are rare while reads are constant, the tradeoff is strongly favourable.

**☐ TASK 4.1 — Denormalise the owner identifier**
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

**☑ TASK 5.2 — Set graduated thresholds**
Set a global threshold at the measured baseline so coverage cannot fall. Set a stricter threshold on `src/lib/engine` and `src/lib/validation`, since those directories carry the calculation correctness and boundary safety guarantees. Wire both into `frontend-gates.yml`.
Gate: workflow fails on a deliberate coverage reduction and passes on `main`.

**☐ TASK 5.3 — Restore cross platform development**
Add plain Node equivalents for the daily commands so `dev`, `clean` and `check` run on any operating system. Retain the PowerShell scripts as separately named aliases for the existing Windows system validation suite rather than deleting them.
Gate: `npm run dev` and `npm run clean` execute on Linux.

**◐ TASK 5.4 — Raise compiler strictness incrementally**
Enable `noUncheckedIndexedAccess` alone and resolve the resulting errors. This flag has the highest defect yield of the three because it forces explicit handling of catalogue and array lookups, which is the same failure mode as finding F2. Then enable `noImplicitOverride`, then `exactOptionalPropertyTypes`, each as a separate change.
Gate after each flag: `npx tsc --noEmit` returns 0 errors.

**☐ TASK 5.5 — Introduce a structured logger**
Replace the 141 console statements with a single logger module supporting level control and a request correlation identifier. Add a lint rule banning bare console usage in `src`.
Gate: lint rule active, all gates green.

**☐ TASK 5.6 — Convert the bundle budget from advisory to binding**
Measure the current gzipped total, set the budget slightly above it, and remove the wording that marks it advisory.
Gate: workflow fails on a deliberate bundle increase.

---

### PHASE 6 — Hygiene

**☐ TASK 6.1** Delete the duplicate `sync-firebase-web-key.ps1` and update the referencing script entry.
**☐ TASK 6.2** Keep one planning document. Delete `plan.md` from the root and retain the `docs` copy, or the reverse, but not both.
**☐ TASK 6.3** Restore the collapsed Python block at `plan.md` line 582 to proper line breaks, or extract it to a real `.py` file under `services/cfd-solver` where it can be linted.
**☐ TASK 6.4** Resolve the 77 lint warnings, starting with the set state inside effect warning at `src/lib/ui/use-theme-color.ts` line 27, then change the lint gate to `eslint src --max-warnings=0`.

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

### Slice D — admin and auth ☑

Slice D was in better shape than F1 implies. F1 counts handlers that "import no
validation module", which is not the same as unvalidated:

- **Auth was already done.** `login`, `register`, `forgot-password` and `google`
  all parse through `lib/validation/auth.ts`. `logout`, `profile` and `refresh`
  read no body at all.
- **`admin/prices` was already validated**, with Zod schemas and `.strict()`.
- **`admin/users/[id]` hand-rolled its parse — and did it correctly.**
  `parseMutation(body: unknown)` narrowed properly and already constrained
  `role` to `'admin' | 'engineer'`. There was no privilege-escalation hole
  here, and it is worth saying so plainly rather than implying one was found.

What was actually wrong was narrower: `await request.json()` throws on a
malformed body, and in all three handlers that throw landed in the outer catch
and returned **500 for what is a client mistake**. The two error shapes also
disagreed — `{ error: <message> }` from `getAdminValidationError` against
`{ error, description, code, details }` from every converted route.

All three now use `parseJsonBody`. The client already read
`data.description || data.error`, so it handles the new shape and gets a better
message: a field path instead of the first issue's bare text.
`getAdminValidationError` had no remaining consumers and is removed rather than
left as a second way to do the same thing.

One deliberate behaviour change: the mutation schema is `.strict()`, so
`{ action: 'disable', role: 'admin' }` is now a 400 where the old parser
silently ignored the role. Checked before making it — `admin-users-panel.tsx`
sends `{ action: 'setRole', role }` or `{ action: kind }` and never both, so
nothing that worked stops working. A request that reads as granting a role and
does not is worth rejecting.

14 tests.

### The boundary is not fully closed, and the slice list is why

Slices A–D are complete: **zero** raw `request.json()` calls remain under
`api/projects`, `api/admin` or `api/auth`. But the plan's slice enumeration
does not cover every handler. Nine sit outside it entirely, under
`diagnostics`, `materials`, `settings`, `suppliers`, `simulation` and
`simulation/reports`.

Seven of those nine already validate with a schema through the older
`safeParse` form — same substance, older shape. **Two do not validate at all**:
`simulation/reports/route.ts` (two bodies) and
`simulation/reports/backfill/route.ts`.

So finishing the four named slices does not finish F1. Those two are the
genuine remainder.

### F1 is substantively closed

The two genuinely unvalidated handlers are done. Across all 47 route handlers:

| | |
|---|---|
| Read no body at all | 16 |
| Parse via `parseJsonBody` / `parseValue` | 20 |
| Parse via the older `safeParse` form | 11 |
| **Read a body with no schema at all** | **0** |

The 11 on `safeParse` are validated — same substance, older shape. What they
still carry is the 500-on-malformed-JSON behaviour and a `{ error }` body that
differs from the other 20. That is a consistency matter, not a safety gap, and
worth stating as such rather than counted as outstanding risk.

#### Two real defects found in `simulation/reports`

**`typeof x === 'number'` is true for `NaN` and `Infinity`.** Every numeric
field on the report history record was guarded that way, so a diverged solve
stored `maxTemperatureC: NaN` and `pue: NaN`, and the history view rendered the
literal text "NaN" beside real figures. `hotspotCount` was worse:
`Math.max(0, Math.trunc(NaN))` is `NaN`, so the clamp that looks like it bounds
the value passed it straight through.

**A parse failure silently widened a delete.** `DELETE /api/simulation/reports`
read its body with `.catch(() => null)`. A request meaning "clear history for
project X" whose body failed to parse left `projectId` undefined — and
`clearSimulationReportHistoryForOwner(ownerId, undefined)` clears **everything
for that owner**. The backfill route had the same shape. Both now reject a
malformed body and still accept an absent one, because a body genuinely is
optional there.

That second one is the more serious of the two, and it is not in the ledger. It
was found by reading the handler while converting it, not by the audit.

PUE is now bounded below at 1 as well as being finite — a facility cannot draw
less total power than its IT load, so a value under 1 is a broken calculation
rather than an efficient datacentre. Zero remains permitted as the
"not computed" default the handler already used.

### TASK 5.1 — coverage baseline ☑

`@vitest/coverage-v8` (117 KB, dev-only) installed; `npm run test:coverage`.
The istanbul provider was the alternative and was rejected — it instruments
source and runs materially slower for the same answer here.

**Scope is deliberately narrow.** Coverage measures `src/lib/**` only, not all
of `src`. Including pages, components and the 3D viewers would put ~40k lines of
browser-only code in the denominator, and the percentage would then track how
much UI exists rather than how well the calculation and boundary code is tested.
A number nobody can act on is worse than no number.

**Baseline, measured on `main` before any new tests:**

| | |
|---|---|
| Statements / lines | **27.43%** (3,929 / 14,319) |
| Branches | **75.74%** |
| Functions | **58.72%** |

Branches at 76% against statements at 27% is the signature of a suite that tests
its subjects thoroughly and leaves large areas untouched entirely — not one that
skims everything.

| Directory | Lines | Covered |
|---|---|---|
| `lib/engine` | 2,500 | 61.0% |
| `lib/validation` | 960 | 55.9% |
| `lib/simulation` | 1,322 | 35.4% |
| `lib/functions` | 4,671 | 21.8% |
| `lib/utils` | 1,256 | 15.2% |
| `lib/auth` | 453 | 6.0% |
| `lib/firebase` | 3,157 | 5.2% |

No threshold is set yet, per the task: a threshold chosen before the number is
known is arbitrary. TASK 5.2 sets one against this figure.

#### What the measurement immediately found

**`load-calculation-engine.ts` had 0% coverage** — 295 lines, nine importers,
and the exact file F2 names. It was reasonable to assume the golden money-path
test reached it; it does not. That test exercises
`lib/functions/cooling-load.ts` and `pricing-engine.ts`, which are a different
path through the product. The `safeDivide` guards added in Phase 2 to this file
were therefore never executed by any test, against CLAUDE.md §6.2.

24 tests now cover it (0% → **98%** lines). They assert physical relationships
rather than the numbers the engine currently produces — a test pinning
`totalBtuAfterFactors` to a literal only proves the code has not changed.

Three of them failed on first run, and two were findings rather than test bugs:

**1. CLAUDE.md §8.5 was not implemented.** The constitution requires that a
diversity factor above 1 "must be flagged". Nothing flagged it, so a value above
1 silently inflated the tonnage, the equipment count and the BOQ total with no
indication on the result. `buildAlerts` now warns — it does not reject, because
the case is legitimate when documented. Verified by mutation.

**2. Envelope load is independent of ΔT.** `envelope_load_formula` is
`area × factor(spaceType)`. `deltaTF` is computed two lines above and used for
ventilation and supply airflow, but never for the envelope — so a Manila design
day at 40 °C yields the same fabric gain as one at 30 °C.

That is a modelling choice (a W/m² estimator with an assumed ΔT baked into the
factor), it lives in a configurable rule set, and it is not obviously a defect.
**It has been pinned by a test and flagged, not changed.** Altering cooling-load
physics is a domain decision, not one to make from a failing assertion — but it
is worth a look, because a tool aimed at Philippine projects that does not vary
fabric gain with outdoor design temperature will under-model the hot cases.

The third failure was mine: a tolerance tighter than the engine's own rounding.

#### The guards in that file are unreachable in production

Worth recording alongside the F2 correction. `buildEquipmentOptions` maps over
`CATALOG`, a hardcoded module constant whose capacities are all positive, so the
`safeDivide` on `item.capacityTr` cannot throw as the code stands. It is
defence-in-depth against a future edit to that constant. Driving it from a test
would mean exporting internals or mutating the constant — testing the harness
rather than the product — so the tests exercise the real path instead.

### TASK 5.2 — graduated thresholds ☑

Thresholds live in `vitest.config.ts` and run in CI via a new
`Coverage thresholds` step in `frontend-gates.yml`.

| Scope | Lines | Branches | Functions |
|---|---|---|---|
| Global | 31 | 76 | 62 |
| `src/lib/engine/**` | 74 | 79 | 80 |
| `src/lib/validation/**` | 77 | 85 | 75 |

Each sits at the measured figure rounded down a point. That point is not slack —
it is so a refactor moving a few lines between files does not fail the build
while coverage is materially unchanged. A real regression drops far more.

**Both halves of the gate were verified, not assumed.** On `main` the run exits
0. With the load-engine suite removed as a deliberate reduction it exits 1 and
names four breaches, including `src/lib/engine` lines falling 74 → 60.8.

The global floor is low because `lib/firebase` (5.2%) and `lib/auth` (6.0%) are
large and mostly untested. Holding engine and validation far above it is the
"graduated" part the task asks for: the directories carrying calculation
correctness and boundary safety are gated hard, and raising the global number is
how the firebase/auth work gets recorded when it happens.

#### Coverage moved 27.4% → 31.3% along the way

Two modules were at 0% and both are worth having:

**`lib/validation/auth.ts` (185 lines).** The password policy — length, case,
digit, symbol, a common-password blocklist, a date-detector and an
email-similarity check — with no test at all. It reads as thorough, which is
probably why nobody checked whether it does what it says. 24 tests now cover it,
each violating one rule at a time so a failure names the rule that broke.

Four of those failed first time and **all four were my assumptions, not
defects**:

- `name` is optional on register; I assumed required.
- The Google credential needs ≥10 characters; my stub was 9.
- The date rule is `^\D{0,2}(\d{8})\D{0,2}$` — **anchored**. It targets a
  password that *is* a date, not one that contains one, so `Manila#20260815`
  passes. That is a deliberate scope (banning every password containing eight
  digits would be over-broad) and the tests now assert the boundary in both
  directions rather than implying the rule is wider than it is.

**`lib/validation/simulation-layout.ts`** was at 0% because I wrote it and wired
it into the handler last night without a test. 18 tests now cover it. Recording
that plainly: the same coverage gap I was measuring for was one I had just
created.

Validation is now 77.9%, up from 55.9%.

### TASK 5.4 — compiler strictness ◐

All three flags were enabled in isolation and measured before any was adopted.

| Flag | Errors | Adopted |
|---|---|---|
| `noImplicitOverride` | **0** | ✅ enabled |
| `exactOptionalPropertyTypes` | 88 | deferred |
| `noUncheckedIndexedAccess` | **1,299** | **declined — see below** |

`noImplicitOverride` was free and is on.

#### `noUncheckedIndexedAccess` does not have the yield the task expects

The task states this flag "has the highest defect yield of the three because it
forces explicit handling of catalogue and array lookups, which is the same
failure mode as finding F2". On this codebase that is not what it does.

Error distribution across the 1,299:

| Code | Count | Meaning |
|---|---|---|
| TS2532 | 697 | Object is possibly undefined |
| TS18048 | 426 | Value is possibly undefined |
| TS2345 / TS2322 | 171 | Assignment mismatch from the above |
| **TS2538** | **1** | **undefined used as an index type** |

TS2538 is the shape that actually corresponds to F2 — an undefined key reaching
a lookup. There is exactly one, and it is safe:
`BRAND_TIERS[manufacturer.split(' ')[0]]`, where `split` on a non-empty string
always yields a first element.

Every sampled TS2532/TS18048 is likewise provably safe but unprovable to the
compiler:

- `STANDARD_ROUND_DUCT_DIAMETERS_IN[length - 1]` on a non-empty `const` array.
- `base[0]` and `base[branches - 1]` on an array built two lines earlier with
  `length: branches`, inside a `branches > 1` branch.
- `sizing.recommended[0]` immediately after `if (sizing.recommended.length === 0)
  continue;` — the compiler cannot connect the guard to the index.
- The bulk of the 766 in `lib/functions` are CFD grid walks (`grid[x][y][z]`)
  bounded by their own loops.

**Fixing these mechanically would be worse than leaving them.** 1,299 sites take
either a non-null assertion or a `?? fallback`. The assertion adds noise and
asserts what the reader already knew; the fallback is the more dangerous of the
two, because `?? 0` on a lookup that should never miss converts a future genuine
miss into a silently wrong number. That is precisely the pattern CLAUDE.md §2.3
forbids and the same shape as the `Math.max(0.1, providedTr)` clamp Phase 2
removed for masking rather than reporting.

The flag is worth revisiting when a file is being rewritten for other reasons —
adopted per-file as code is touched, not as a 1,299-site sweep. Recorded as
measured-and-declined rather than outstanding, so it is not re-attempted blind.

`exactOptionalPropertyTypes` at 88 is tractable, but the sample is dominated by
React prop passing (`string | undefined` into `helperText?: string`), which is a
widening exercise rather than a correctness one. Deferred, not declined.


---

## Execution log — TASK 2.3, engine division sweep

**The count in F2 does not hold.** The finding records "197 division operations
and only 13 finite value checks". A `/` search counts line comments, string and
path literals, regex flags and test files. Excluding those, `src/lib/engine`
contains **76 division sites** — 19 with a literal denominator, 54 with a
variable one. Full classification in `docs/audit/division-audit.md`.

Of the 54, **53 were already safe** and the reasons are worth stating, because
"already safe" is the answer that gets assumed rather than checked:

- 27 have a `Math.max(floor, …)` denominator with a positive floor. The largest
  group is `geometry-builder`'s cell size, 21 sites fed by one `clampCellSize`
  that returns `Math.max(MIN_CELL_SIZE, …)`.
- 10 divide by a module constant or `Math.PI`.
- 8 carry an explicit guard already — a ternary, an early return, or an `&&`
  chain whose short-circuit means the division only runs on a positive value.
- 4 are `pmv.ts` correlations whose denominators carry an additive offset that
  puts the singularity outside the physical domain (`tempC + 243.04` is zero at
  −243 °C). A guard there would be unreachable.
- 3 are `10 ** digits` inside private `round()` helpers.
- 1 *is* `safeDivide`.

**The one that needed a guard was the worst one to have missed.**
`trRequired = totalBtuAfterFactors / btuPerTr` in `load-calculation-engine.ts`.
`btuPerTr` is read from the rules layer rather than written in the function, so
it is external by rule 6, and it sets equipment quantity and therefore the BOQ
total (§8.4).

**The upstream cause was larger than the division.** The six bundled rules files
entered the engine as `coolingLoadRules as unknown as RuleSet`. `RuleSet` is a
compile-time interface, so that double assertion checked nothing — the same
escape hatch `any` provides, sitting upstream of every physical constant the
engine uses. `"btu_per_tr": "12000"` in a checked-in JSON file compiled, linted
and passed all 472 tests. Fixed in two layers: `rules/rule-schema.ts` validates
shape and finiteness at load, and `safeDivide` catches the zero the schema
cannot (zero is legitimate for most constants; the schema has no way to know
which ones are divisors).

**Both layers were mutation-tested.** Quoting the number in the shipped JSON
fails 4 schema tests; reverting the guard fails 4 guard tests.

One correction worth recording: the guard tests initially asserted only
`toThrow(CalculationError)` and **passed with the guard removed**, because a
corrupt tonnage also trips guards downstream in equipment selection. A test that
passes under mutation is not a test. They now assert the error `context`, which
pins the failure to this division.

**Flagged, not changed** (in `docs/audit/division-audit.md`): an inline
`0.000471947` CFM→m³/s factor in `geometry-builder.ts:372` (rule 5), an
unguarded caller-supplied `targetCellBudget`, and `getEnvelopeFactor`'s
`catch { return 120 }` silent fallback (rule 3).

Gates: tsc 0 errors, eslint 0 errors / 77 warnings, vitest 44 files / 491 tests
(472 → 491, +19).


---

## Execution log — TASK 3.1, run handler decomposition

`projects/[id]/simulations/[simId]/run/route.ts` went from **564 lines to 91**.
Extracted into three modules plus one shared helper:

| Module | Lines | Holds |
|---|---|---|
| `lib/simulation/run-orchestrator.ts` | 269 | access, lifecycle rules, solver dispatch, the reason-to-status table |
| `lib/simulation/run-execution.ts` | 537 | the two internal executors and their solver adapters |
| `lib/simulation/run-deps.ts` | 38 | the one place the orchestrator is joined to Firestore |
| `lib/api/boundary.ts` | 83 | `guardRequest` and `withRouteErrorHandling` |

Mechanism: dependency inversion. Every store operation is declared on
`RunOrchestratorDeps` and passed in, so the orchestrator imports nothing from
`lib/firebase` and every branch is reachable from a test with plain objects.
Both entry points return a discriminated union; the handler maps `reason` onto a
status through a single `Record<RunFailureReason, number>`, so adding a reason
without deciding its status is a compile error rather than an accidental 500.

**The handler is 91 lines, not the 80 the gate names.** What remains is eight
lines of doc comment, twelve imports, two rate-limit constants, the nine-line
`failureResponse`, and two ~25-line verb bodies. Reaching 80 would mean deleting
documentation or inlining `failureResponse` into both verbs — making the file
worse to hit a number. Recorded as missed-by-11 with the reason, rather than
either claimed as met or papered over.

**A real defect surfaced during the extraction.** The runnability guard read
`!simCase.mesh && simulationScope !== 'building'`, so a building-scope case with
no `buildingGeometry` passed it, fell through to the room executor, and died on
`simCase.mesh!`. The `TypeError` was caught by the executor's own handler and
written to the run job as a solver failure, so the client saw "Cannot read
properties of undefined (reading 'cellSizeM')" attributed to the CFD solver.
`resolveRunnableCase` now requires each scope's own precondition and returns
`MISSING_BUILDING_GEOMETRY` as a 400 naming what is absent. The `mesh!` and
`buildingGeometry!` assertions are gone — the executors take types that carry
the precondition, so the compiler enforces what the comment used to claim.

**A second rule-6 division was found and guarded.** The route computed
`thermalConductivity / (density * specificHeat)` inline, twice, with both
denominators read off the stored case. Now `thermalDiffusivityM2PerS`, guarded
with `requirePositive` and tested against the published value for air
(2.12e-5 m2/s) so the identity is checked, not just the guard.

**Tests: 59 new** across three files — 36 orchestrator (every failure branch,
both dispatch paths, the external-source path, the status table), 16 executor
lifecycle (status transitions, both failure paths, the best-effort snapshot),
7 diffusivity. None of this was reachable before: exercising it meant an
authenticated HTTP request against a live Firestore, so in practice the
lifecycle rules had never been asserted.

Three mutations confirm the orchestrator tests bite: restoring the old
mesh-before-scope ordering fails 5; dropping `queued` from the active-run check
fails 1; letting an unowned project through fails 1.

**Also extracted:** `rateLimitResponse` in `api-helpers.ts`. The 429 block was
written out by hand in 41 route files (72 occurrences of `Retry-After`).
Adopted here only; the rest pick it up in TASK 3.2 so each adoption lands with
that handler's tests rather than as an untested sweep.

Gates: tsc 0 errors, eslint 0 errors / 77 warnings, vitest 47 files / 551 tests
(491 -> 551, +60), next build clean. Coverage rose rather than fell:
statements 31.55 -> 33.6, functions 61.01 -> 64.


---

## Execution log — project authorisation gap (found during TASK 3.2)

**Ten route handlers under `projects/[id]` enforced authentication and nothing
else.** They called `requireAuth`, established who was calling, and never
compared that against the project's owner:

`boq`, `boq/[itemId]`, `boq/verify`, `calculate`, `equipment`,
`equipment/[selectionId]`, `floors`, `floors/[floorId]`, `rooms`,
`rooms/[roomId]`.

This is not a missing second layer. Every store function these call runs through
the Firebase **Admin SDK, which bypasses Firestore security rules entirely** —
the same fact recorded under F6, where it meant the read-cost finding did not
apply. It cuts the other way here: the rules in `config/firebase/firestore.rules`
do nothing for API traffic, so the handler was the only gate, and it was open.

Any signed-in user could read or overwrite another account's data by guessing a
project id. `POST /projects/[id]/boq` is the worst of them: it replaces every
BOQ item on the project, updates the project record, creates a snapshot, and
writes an audit-log entry attributing the change to the caller.

The odd part is that the fix already existed. `lib/auth/project-access.ts`
exported `canAccessProject` and `projectAccessDenied` — correct, and used by
exactly one route out of twenty-three. The defect was not a missing helper but a
helper nobody called.

**Fix.** Extended `project-access.ts` with `checkProjectAccess`, returning a
discriminated union so `project` is unreachable without narrowing on `ok` —
omitting the denial branch is now a compile error rather than an open door. All
ten routes gated. A missing project is reported 404 and a non-owner 403, since a
caller may legitimately own a project that has since been deleted.

**A unit test could not have caught this class of defect**, because the helper
was already correct and simply unused. What failed was coverage across route
files, so that is what is asserted: a structural test enumerates every route
under `src/app/api/projects` and requires an ownership marker, with three
documented exemptions (the collection endpoint, which scopes by `ownerId`; the
run route, which delegates to the orchestrator; the OpenFOAM callback, which is
machine-to-machine behind a shared secret). A stale exemption fails the suite, so
a rename cannot hide a new gap. Verified by mutation: stripping the guard from
`boq/route.ts` fails it.

**One correction during the work.** Putting `requireProjectAccess` in
`project-access.ts` dragged `projects-store.ts` and its 69 mostly-untested
functions into the module graph of every test that touched authorisation, and
function coverage fell 64 -> 56.28, red against the 62 threshold. Lowering the
threshold would have been weakening a gate. The real answer was that the pure
authorisation decision should not import the persistence layer at all: the
loading variant moved to `require-project-access.ts` and `project-access.ts` now
imports nothing from `lib/firebase`. Coverage recovered to 62.83.

Gates: tsc 0 errors, eslint 0 errors / 77 warnings, vitest 49 files / 587 tests
(551 -> 587, +36), next build clean, coverage 34 / 76.97 / 62.83.

TASK 3.2's line-count decomposition is still outstanding; this was found while
reading the first of its four handlers and was worth landing on its own.


---

## Execution log — TASK 3.2, BOQ handler decomposition

`projects/[id]/boq/route.ts` went from **470 lines to 80**, meeting the gate.
Extracted into six modules under `src/lib/boq/`:

| Module | Lines | Holds |
|---|---|---|
| `boq-generation.ts` | 250 | the POST pipeline, behind an injected-deps interface |
| `boq-summary.ts` | 201 | the GET read model: line-price fallbacks and the quotation rollup |
| `boq-inputs.ts` | 179 | selections to cost-engine inputs, and the sizing assumptions |
| `pricing-policy.ts` | 99 | the four dual-control rates, resolved once |
| `boq-read.ts` | 58 | the GET response shape |
| `boq-deps.ts` | 31 | the only place `lib/boq` is joined to Firestore |

Same mechanism as TASK 3.1: every store call is declared on
`BoqGenerationDeps` and passed in, so `lib/boq` imports nothing from
`lib/firebase` and the pipeline runs against plain objects.

**Two defects fixed in the electrical sizing**, both on lines the route had
inlined:

1. `capacityBTU * 0.000293` was an unnamed Btu/h-to-kW conversion — rule 5, and
   the same constant recorded earlier in this plan as drifting **0.024%** from
   exact. Now `btuPerHourToKilowatts` from `engine/units.ts`.
2. `/ (eer || 10)` silently substituted a plausible efficiency for a missing
   one. A catalogue row with `eer: 0` produced a wrong input power, and from
   there a wrong breaker and cable size, with nothing reported — rule 3 and
   rule 6 together. Now `electricalInputPowerKw`, guarded, code
   `INVALID_EQUIPMENT_EER`.

**Flagged, not changed.** `costPerTR` derives total capacity by regex over the
equipment *description strings* (`/(\d+\.?\d*)\s*TR/`). A line described
"3.5 Ton" contributes zero and the figure silently understates. Capacity belongs
in a column. Left alone because changing it changes stored data, and this task
was meant to preserve behaviour; recorded in `boq-summary.ts` and here.

**67 new tests.** 20 on the money rollup (zero-means-not-computed fallbacks,
the VAT-after-markup ordering, the guarded cost-per-ton), 22 on the inputs, 15
on the pipeline ordering, plus 19 on `pipe-sizing.ts` — see below. Four
mutations confirm they bite: VAT on the bare subtotal fails 1; `||` for `??` on
a price override fails 1; restoring the `eer || 10` fallback fails 6; hashing
compiled rows instead of stored rows fails 1.

**Two corrections during the work.** First, the deps interface was written with
`Record<string, unknown>` and the compiler rejected it against the real store
signatures — the same over-widening as in TASK 3.1, fixed by using the domain
types and exporting `AuditLogInput`. Second, branch coverage went red (75.35 vs
76) because `boq-inputs.ts` legitimately pulls the sizing modules into the
denominator. Unlike the earlier auth case this could not be decoupled — sizing
is what the module does — so the answer was to cover it: `pipe-sizing.ts` was
sitting at 4 of 15 branches while feeding pipe diameter, braze-joint labour and
refrigerant charge straight into the bill. Nineteen tests later, branches are
76.98.

Gates: tsc 0 errors, eslint 0 errors / 77 warnings, vitest 53 files / 663 tests
(587 -> 663, +76), next build clean, coverage 36.02 / 76.98 / 62.75.

Remaining in TASK 3.2: `projects/[id]/route.ts` (282), `runs/route.ts` (260),
`equipment/route.ts` (259).


---

## Execution log — TASK 3.2, project handler decomposition

`projects/[id]/route.ts`: **282 lines -> 108**. Extracted
`lib/projects/project-update.ts` (194 lines), which holds the field-by-field
merge and the staleness rule, and added `checkProjectAccessAudited` to
`lib/auth/project-access.ts` so the load-check-audit triple is stated once
rather than in each of three verbs.

**108 is not the 80 the gate names.** Three verbs, each carrying a rate limit,
an ownership check that audits its denials, and its own store work. GET is 12
lines, PUT 30, DELETE 25; the rest is imports and the doc comment. The run
route landed at 91 for the same reason with two verbs. Recorded as
missed-by-28 rather than reached by deleting documentation.

The audit helper takes the project the caller already loaded, rather than
fetching its own. GET needs `getProjectWithDetails` and the mutations need
`getProjectRecord`; a helper that did its own read would have added a second
one to every request. It also keeps the asymmetry that was already there and is
correct: a missing project is a silent 404, a denied one is logged then 403 —
reaching for someone else's project is worth a trail, mistyping an id that
exists nowhere is not.

**Two rules in the merge decide whether a quotation stays trustworthy**, and
neither had a test:

1. `pricingRatesChanged` compares resolved rates against stored values rather
   than asking whether the request mentioned them. The edit form submits the
   whole project, so treating "mentioned" as "changed" would mark a correct
   bill stale on every unrelated save.
2. `toNullableNumber` keeps `null` and `undefined` distinct: `null` clears an
   override deliberately, `undefined` means the request was silent. Collapsing
   them to `?? fallback` would make an override impossible to remove.

Wet bulb stays derived from dry bulb and relative humidity rather than accepted
from the client, so the three cannot drift out of agreement.

18 tests. Three mutations confirm they bite: treating a mentioned rate as
changed fails 1; collapsing the null/undefined distinction fails 3; keeping
`lastBoqGeneratedAt` when the bill goes stale fails 1.

Gates: tsc 0 errors, eslint 0 errors / 77 warnings, vitest 54 files / 681 tests
(663 -> 681, +18), next build clean, coverage 36.19 / 77.17 / 63.43.

Remaining in TASK 3.2: `runs/route.ts` (260), `equipment/route.ts` (268).
