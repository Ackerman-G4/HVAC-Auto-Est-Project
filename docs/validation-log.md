# CFD Validation Log

> This log is the difference between marketing language and an engineering claim
> (plan v2.0 §10). **Nothing in the CFD engine is "engineering-grade" until the
> Section 4.4 ladder below passes and this log records it.** Version it; keep it
> honest; show it to any client engineer who asks how we know.

Each run records: date, the case (room), solver + turbulence model, mesh cell
count, and the pass/fail of each rung with the actual numbers.

## The ladder (plan §4.4)

| Step | Check | Pass criterion |
| ---- | ----- | -------------- |
| V1 | Sanity | Buoyancy direction correct; outlet T between inlet T and wall T; no NaN/Inf anywhere |
| V2 | Mass balance | Σ inlet volumetric flow vs Σ outlet flow at convergence — imbalance < 2% |
| V3 | Cross-solver | Same room through Preview and Engineering; mean T within ±15% (°C-above-inlet), mean \|U\| same ballpark |
| V4 | Hand calculation | Steady-state energy balance (inlet enthalpy + heat load) vs OpenFOAM mean room T — within a few percent |
| V5 | Breadth | Repeat V1–V4 on 3–4 different real rooms — all pass |
| V6 | Turbulence upgrade | Switch turbulence model to `k-omega-sst` and re-run V1–V5 — passes (this is where v3.0's SST k-ω goal is achieved, via a dropdown) |

The cross-solver rung (V3) uses the Comparison view (plan §6.2) — Preview vs
Engineering, linked cameras.

## Status

**Not yet started.** Gated on Phase C1 (first local OpenFOAM solve). No run has
been executed against a live solver as of the date this scaffold was created —
see the plan's honest sequencing note. Do not mark any rung passed without the
numbers.

## Runs

<!--
Copy this block per run:

### <YYYY-MM-DD> — <room name>
- Solver: buoyantSimpleFoam | turbulence: kEpsilon | mesh cells: <n>
- V1 Sanity:        PASS/FAIL — outlet T = __ °C (inlet __, wall __); NaN/Inf: none
- V2 Mass balance:  PASS/FAIL — imbalance __ %
- V3 Cross-solver:  PASS/FAIL — mean ΔT preview __ °C vs engineering __ °C (Δ __ %)
- V4 Hand calc:     PASS/FAIL — energy-balance T __ °C vs solver mean T __ °C (Δ __ %)
- Notes / log excerpts:
-->

_No runs recorded yet._
