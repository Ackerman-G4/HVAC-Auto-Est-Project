# Architecture (v3)

How the app is laid out after the overhaul-v3 work. Companion to
`docs/overhaul-v3-results.md` (phase status) and `docs/engine-invariants.md`
(the calculation contract).

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) · React 19 |
| Language | TypeScript (strict) |
| State | Zustand 5 |
| Styling | Tailwind CSS 4 + design tokens (`src/styles/*`, `globals.css`) |
| 3D / CFD | three 0.179 + @react-three/fiber 9 + drei |
| Charts | recharts 3 (always `next/dynamic`-loaded) |
| Motion | framer-motion 12 (via `src/lib/ui/motion.ts`) |
| Validation | zod 4 |
| Backend | Next API routes + Firebase Admin (or the local-JSON firestore mock in dev) |

## Directory map

```
src/
  app/                       # routes (App Router) — pages are thin shells
    api/                     # 44 API routes
  features/<domain>/         # extracted page logic + presentational components
    materials/               # useMaterialsCatalog hook + components
    reports/                 # useReportsWorkspace hook + components
    project-detail/          # useProjectDetail hook + RoomsTab/BoqTab/...
    floorplan/               # useFloorplan hook + geometry/types/constants
    simulation/viewer/       # useSimulationViewer hook + panels/tab content
    simulation/engine/       # useSimulationEngine hook + case/run/snapshot panels
  components/
    ui/                      # primitives (button, dialog, command-palette,
                             #   shortcuts-sheet, calc-breakdown, autosave-indicator, …)
    layout/                  # app-shell, sidebar, onboarding-tour, welcome-overlay
    charts/                  # dynamic recharts blocks (dashboard/load/equip/airflow)
    building/                # AirflowViewer3D, CFDOverlay3D, BuildingViewer3D, …
    simulation/r3f/          # newer R3F SimulationCanvas + layers
    admin/                   # admin console panels
    diagnostics/             # SystemHealthCard
  lib/
    engine/                  # money/HVAC engines (hvac/, cost/, rules/, pricing-engine)
    functions/               # cost-engine, cooling-load, psychrometric, cfd-simulation, auto-detect
    simulation/              # normalize-room-layout, scene-transform, geometry-2d, building-geometry
    firebase/                # local-firestore mock + server wiring
    ui/motion.ts             # shared motion tokens/hooks
  stores/                    # zustand stores (see below)
  styles/                    # tokens.css / typography.css / spacing.css
```

**Decomposition rule:** a route `page.tsx` is a composition shell. Its state and
logic live in a `use<Domain>()` hook under `src/features/<domain>/`, and its
large JSX lives in presentational components there. Extraction is a *move*, not a
rewrite — the golden money-path tests stay green across it.

## Store map

| Store | Responsibility |
|---|---|
| `auth-store` | session/user |
| `ui-store` | theme (light/dark), UI prefs |
| `project-store` | project list |
| `load-workspace-store` / `airflow-workspace-store` / `equipment-workspace-store` | the standalone calculator workspaces |
| `workspace-store` | cross-module workspace glue |
| **`simulation-store`** | the unified simulation store — `SimulationStoreState = base data-center CFD slice + engine slice`. Consumed by the viewer, workspace, and engine pages. |
| `simulation-engine-slice` | the OpenFOAM case/run/snapshot slice, composed into `simulation-store` (no longer a standalone store) |

## Route map (pages)

- `/` dashboard · `/projects` list · `/projects/new` (guided wizard) ·
  `/projects/[id]` detail · `/projects/[id]/floorplan` (+ `/preview`)
- Calculators: `/load-calculation` · `/equipment-selection` ·
  `/airflow-duct-design` · `/quotation` · `/materials` · `/reports`
- Simulation: `/simulation` (launcher) · `/simulation/viewer` (the CFD
  workspace) · `/simulation/engine` (OpenFOAM case management).
  `/simulation/workspace` redirects to `/simulation/viewer` — it was a subset of
  it; its report export and solver runtime/dimension controls were ported over.
- Ops: `/admin` (RBAC) · `/diagnostics` · `/settings`
- Auth: `/auth`, `/auth/login`, `/auth/register`, `/auth/forgot-password`

## Cross-cutting UX

- **Command palette** (`Ctrl/⌘ K`) and **shortcuts sheet** (`?`, `g d`/`g p`) —
  mounted globally in the app shell.
- **WorkflowRail** on project detail — the Floorplan → Loads → Equipment →
  Ducting → BOQ → Quotation → Reports golden path with per-stage status.
- **Onboarding tour** — first-run, dismissible, persisted.
- **CalcBreakdown** — "explain the numbers" drawer over engine formula traces.
- **Dark theme** — every token mirrored under `[data-theme="dark"]`, toggled via
  `ui-store` and applied to `<html>` by the app shell.

## Verification

`npm run check` = `tsc --noEmit && eslint src && vitest run`. `npm run build`
for the production bundle. The engine contract is enforced by the suites listed
in `docs/engine-invariants.md`.
