# CFD / 3D Airflow Scene — Fix Plan

Dependency-ordered workstreams (one commit each). Derived from `cfd-scene-audit.md`.
Binding directive rules: single source of truth, data-repair (no silent persistence),
auto-fit camera, truthful overlays, minimal diff.

## Design decisions
- `normalizeRoomLayout` lives in **`src/lib/simulation/normalize-room-layout.ts`** (importable by both
  the zustand store and the viewer feature). `src/features/simulation/viewer/helpers.ts` delegates.
- **`autoDetectEquipment` survives**; `inferRacksFromRoom`/`inferHVACFromRoom` are deleted. Its broken
  placement internals are rewritten to place equipment inside polygon-anchored room rects.
- Empty-polygon case reuses the **solver's own** fallback via a new `resolveRoomRects(floor)` exported
  from `building-geometry.ts` — equipment and solver geometry share identical deterministic rects.
- Centering single-sourced through **`src/lib/simulation/scene-transform.ts`**.

## Workstreams
- **WS1 — Foundations.** `scene-transform.ts` (`getDomainCenter/worldToScene/getDomainBBox`) + temporary
  dev-only `debug-scene-dump.ts`. Replace inline center math. Pure refactor.
- **WS2 — normalizeRoomLayout.** `resolveFloorScale` (default 50); one conversion step: origin-translate,
  drop non-finite (nullable map + logged warning), floor-snap (z=0 for floor-mounted), bounds-clamp,
  snap+validate racks AND HVAC, single grid-sizing rule. Move pure predicates to `geometry-2d.ts`.
- **WS3 — Consolidate auto-detect.** Fix the axis swap (depth→y, z=0); one implementation in
  `auto-detect-equipment.ts` using `resolveRoomRects`; delete `infer*`; route both paths through
  `normalizeRoomLayout`.
- **WS4 — Camera auto-fit + reset.** `computeCameraFit(bbox)`, `<AutoFitCamera>`, orbit limits from fit,
  `resetView()` on the handle + button. Remove hardcoded camera constants.
- **WS5 — Truthful overlays.** Exclude HVAC-inlet cells from hotspots; render existing `ContourSlicePlane`
  for the slice in velocity mode; clamp `sliceIdx`.
- **WS6 — Wire pipeline + no-silent-persist.** Hydration routes through `normalizeRoomLayout`; layout hash
  computed from normalized payload so no PUT fires on load; warnings surfaced via existing toast.
- **WS7 — Remove debug dump + final gate.**

## Verification per WS
Each WS: re-run the debug dump (assert the predicted numbers changed, e.g. all floor items `bboxMinY=0`),
add the WS's tests, and pass the full gate (`tsc --noEmit`, `eslint src`, `vitest run`, `next build`).
Definition of done validated on a real seeded QA project (see plan file).
