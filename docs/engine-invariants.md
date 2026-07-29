# Engine Invariants

The contract the calculation engines must uphold, enforced by the test suite.
Any future change that breaks one of these should fail CI (`npm run check`) —
if a change is intentional, update both the code and this document in the same
commit.

## Money path (locked by golden snapshots)

`src/lib/engine/__tests__/golden-money-path.test.ts` freezes the exact numeric
output of the money path for three representative fixtures (office / server
room / retail) across `calculateCoolingLoad → calculateEquipmentSelection →
compileBOQ → calculateTotalProjectCost`. These use `toEqual` (byte-identical),
not approximate matching. **Re-baselining requires deleting `fixtures.json` —
never do this silently.**

- **BOQ total = Σ line items.** The grand total equals the sum of its
  component line totals (verified in `boq-sections.smoke.test.ts` + golden).
- **Currency is deterministic.** Identical inputs produce identical peso
  figures on every run (volatile fields such as `timestamp`/`generatedAt` are
  normalized out of the golden snapshot).

## Equipment selection (`equipment-selection-engine.ts`)

Enforced by `equipment-selection.test.ts`:

- **Capacity coverage.** Every candidate's `providedTr ≥ requiredTr` (before
  redundancy). No candidate is ever undersized for the load.
- **Utilization identity.** `utilizationPct === requiredTr / providedTr × 100`,
  always in `(0, 100]`.
- **Monotonic in load.** A larger `requiredTr` never selects a top candidate
  with *smaller* provided capacity.
- **N+1 redundancy** never yields less total capacity than the non-redundant
  case.
- **Bounded shortlist.** At most `max_candidates` (12) candidates returned;
  every quantity ≥ 1.
- **Energy cost tracks the tariff.** A higher `electricityRatePhpKwh` strictly
  raises `annualEnergyCostPhp` for the same load.
- **Lifecycle ≥ capex.** `totalLifecyclePhp ≥ capexPhp` (energy adds, never
  subtracts). Deterministic candidate ordering.

## Airflow & duct sizing (`airflow-duct-engine.ts`)

Enforced by `airflow-duct.test.ts`:

- **One sizing row per branch**, all values finite and positive.
- **Flow conservation.** Σ branch `designCfm` ≈ `supplyCfm` (±10%).
- **Velocity is bounded, not runaway.** Ducts are sized toward the target
  velocity, so branch `velocityFpm` stays in a physically sane band
  (200–4000 FPM) as `supplyCfm` scales — it does not grow without bound.
- **Fan power tracks airflow.** More `supplyCfm` demands more
  `requiredFanPowerHp`.
- **Determinism** for identical inputs.
- **Bounds validation.** `validateAirflowScenario` flags out-of-range
  `supplyCfm` / `branches` / `targetVelocity`; in-range defaults raise no
  critical issue.

## CFD scene / layout (`normalize-room-layout.ts`, `scene-transform.ts`)

Enforced by `normalize-room-layout.test.ts` + `scene-transform.test.ts`
(added during the CFD scene fix):

- **Single coordinate pipeline.** `position.x` = floor horizontal (m),
  `position.y` = floor depth (m), `position.z` = elevation (m). Exactly one
  function converts project data → world-space scene coordinates.
- **Floor-mounted equipment is grounded** (`z = 0`); positions are clamped
  into the domain.
- **No NaN → origin pile-ups.** Malformed placements are dropped (with a
  warning), never coerced to `{0,0,0}`.
- **Camera fit follows geometry** — no hardcoded distance; frame targets the
  domain centre and scales with the largest extent.

## Hotspots (`cfd-simulation.ts` `computeMetrics`)

Enforced by `hotspot-metrics.test.ts`:

- **Zero hotspots on a trivial-spread field** (absolute warning threshold).
- **HVAC-occupied cells are excluded** — no hotspot marker inside an HVAC
  supply-inlet footprint.

## OpenFOAM export (`openfoam-exporter`)

Enforced by `openfoam-export.smoke.test.ts`: the exported file set is complete
per solver contract (per-solver required files present).

## How to run

```
npm run check    # tsc --noEmit && eslint src && vitest run
```
