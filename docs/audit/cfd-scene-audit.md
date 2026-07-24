# CFD / 3D Airflow Scene Audit (Phase 0)

Evidence-first audit of the 3D Airflow view (`/simulation/viewer`, `/simulation/workspace`)
following the CFD/3D Scene Audit directive. Every claim below is code- or data-backed;
two directive hypotheses were **corrected by evidence** (noted inline).

## Trigger symptoms (user-reported, screenshot-verified)
1. Racks/HVAC float off the grid, scatter diagonally, inconsistent scale
2. Camera framing leaves most of the viewport empty
3. A hotspot renders inside an HVAC unit
4. Slice number shown but no visible slice plane
5. Stats bar values suspect

## 0.1 Surface-area map
- Symptomatic component: **`src/components/building/AirflowViewer3D.tsx`** (Canvas ~line 620),
  rendered by `simulation/viewer`, `simulation/workspace`, and `simulation/engine` (legacy branch).
- Reference correct camera: `src/components/simulation/r3f/SimulationCanvas.tsx:51-70` (fit-to-extents).
- Transform math is internally consistent, but `centerX/centerZ` are recomputed in ~9 places
  (AirflowViewer3D + every CFDOverlay3D layer).
- Grid (`FloorGrid`) is origin-centered, sized `max(gridX,gridY)*res`; grid size computed by two
  different rules (viewer/page.tsx:1001-1031 layout path ignores racks; :1238-1246 sqrt-area clamp).
- Camera hardcoded to grid-domain span, target (0,0,0), no fit-to-bounds, no reset (AirflowViewer3D:607-622).
- Hotspots: `computeMetrics` (cfd-simulation.ts:1087-1104) thresholds every non-obstacle cell; no
  exclusion of HVAC-inlet cells. Scene mapping is correct.
- Slice: no visible plane mesh is ever rendered (`InspectPlane` opacity 0). `ContourSlicePlane`
  exists (CFDOverlay3D:391-545) but is **never imported**.
- Stats bar: all live from solver `metrics` — **not constants** (hypothesis discarded).
- Dead/orphan: `BuildingSimulationViewer3D.tsx`, exported-but-unimported `ContourSlicePlane`/`DenseVelocityArrows`.

## 0.2 Position pipeline trace
Canonical convention (renderer AirflowViewer3D:66 + solver cfd-simulation.ts:159-166):
`position.x` = floor horizontal (m), `position.y` = floor depth (m), `position.z` = elevation (m).

- **Axis-swap bug** — `src/lib/functions/auto-detect-equipment.ts` writes floor **depth into `position.z`**
  with `position.y = 0` (racks :99-100, CRAC :123-127, and the other HVAC blocks). Reached via
  `store.autoDetectFromProject` from `simulation/workspace`. Renderer maps z→vertical → racks float and
  collapse to one line; solver jams all racks at grid row 0. **Dominant float+scatter bug.**
- **Origin bug** — `inferRacksFromRoom` (helpers.ts:380) uses naive `{x: offsetX+i*1.2, y:1, z:0}`
  (ignores polygon) while `inferHVACFromRoom` anchors to polygon centroid → racks vs HVAC in different
  frames. Racks never boundary-validated. (Correction: the `y:1` is floor-depth, **not** a vertical/float bug.)
- HVAC layout path is unit-consistent (floorplan divides px→m at author time; API stores verbatim; map
  passes through). But `toFiniteNumber(x,0)` (helpers.ts:93-95) silently piles malformed units at origin.
- Scale default `1` (deriveFloorBoundsMeters/buildRoomBoundariesForFloor) vs `50` (resolveCanvasScale)
  → scaleless polygon treated as px = 50× blow-up.

## 0.4 Real-data audit — **VERDICT: missing-data condition is primary**
Inspection of `.local-firestore.json` (seeded QA 01–05 projects, user `local_1784861610001_o2nn3f43`):
- **436/436 rooms have `polygon: "[]"`**; schema has no width/length/vertices.
- **0/75 floors have `floorPlanImage`**; all `scale: 50`.
- **0 `simulationLayouts` docs exist** anywhere — placements/canvasScale never persisted.
- Racks never stored — only runtime-inferred.
- Fallback machinery (`building-geometry.ts`): `parseRoomPolygon`→null→`deriveRectFromArea`
  (sqrt(area) squares) + per-floor shelf-packing cursor → **fabricates the scattered layout**.

Implication: renderer fixes alone cannot produce a correct scene from `polygon:"[]"`. Data-repair
(render-time sanitize, no silent persistence) is a first-class workstream.

## 0.5 Root-cause table
| Symptom | Root cause | Evidence |
|---|---|---|
| Float off grid | Axis swap (depth→position.z), auto-detect-equipment.ts | Renderer z→vertical (AirflowViewer3D:69) |
| Diagonal scatter | Missing polygons → shelf-pack fallback (building-geometry.ts:165-217); rack-vs-HVAC origin mismatch (helpers.ts:380 vs 445-466) | Data audit + trace |
| Inconsistent scale | sqrt(area) squares; scale default 1 vs 50 | Data audit + trace |
| Empty viewport | Hardcoded camera, no fit/reset (AirflowViewer3D:607-622) | SimulationCanvas.tsx:51-70 pattern |
| Hotspot in HVAC | No exclusion of HVAC-inlet cells in computeMetrics (cfd-simulation.ts:1087-1104) | Surface scan §4 |
| Slice, no plane | No plane rendered; ContourSlicePlane never imported | Surface scan §5 |
| Stats suspect | **Discarded** — values are live | Surface scan §6 |
| Corner pile-ups | toFiniteNumber(pos,0) fallback (helpers.ts:93-95) | Trace §4 |
