# Load-Time / Smoothness Plan

Evidence-first performance pass. Measurements taken against the running dev
server with the seeded QA projects (52 rooms × 9 floors).

## Measured baseline (what is NOT slow)

| Layer | Measured | Verdict |
|---|---|---|
| `GET /api/projects` | 24–28 ms warm | fine |
| `GET /api/projects/[id]` | 15–18 ms warm | fine |
| Page HTML TTFB (warm) | 53–85 ms | fine |
| `/simulation/viewer` cold compile | 1.6 s | dev-only (on-demand compile) |

The earlier 68 MB `.local-firestore.json` re-parse-per-operation bottleneck is
already fixed (in-memory cache + debounced flush + prune to 4 MB), which is why
the API numbers are now flat. **The remaining cost is client-side JavaScript.**

## Root causes (client bundle)

| # | Finding | Impact |
|---|---|---|
| P1 | **recharts statically imported on 5 routes** — `/` (dashboard), `/load-calculation`, `/equipment-selection`, `/airflow-duct-design`, and `ReportsCharts` (`/reports`). recharts is ~7.8 MB in node_modules; a large minified chunk ships on first paint of each. | **High** — the dashboard is the app's landing page |
| P2 | **`src/lib/utils/report-generator.ts` is dead code** (zero importers) but statically imports `pdfmake/build/pdfmake` **and `vfs_fonts` (835 KB of base64 fonts)**. Risk of accidentally being pulled into a bundle. | Medium (latent) |
| P3 | **framer-motion statically imported in 27 files** (~5.3 MB pkg). Tree-shakes reasonably but the full `motion` factory is heavy. | Medium |
| P4 | Dev-mode on-demand compilation makes heavy routes feel slow (1.6 s cold for the R3F viewer). Not a production cost. | Informational |

Already correct (no action): three/@react-three are `next/dynamic` at page level;
exceljs and pdf-make are `await import()` on action; fabric is unused (raw canvas).

## Plan (priority order) — as executed

- **P2 (done) — Delete `report-generator.ts`.** Confirmed zero importers; removes the pdfmake + 835 KB vfs_fonts static import from the graph entirely.
- **P1a (done) — Lazy-load the dashboard + reports charts.** The landing page (`/`) and `/reports` now `next/dynamic(..., { ssr:false, loading: <ChartSkeleton/> })` their recharts blocks (`src/components/charts/DashboardCharts.tsx`, `ReportsCharts`), so recharts never blocks first paint on the two most-hit chart routes.
- **P1b (done) — `optimizePackageImports`** for `recharts`, `lucide-react`, `framer-motion` in `next.config.ts`. App-wide: every route (incl. the three calculators that still import recharts inline) bundles only the components/icons it uses, shrinking first-load JS without a risky 15-chart extraction. lucide-react (used in ~everything) is the biggest beneficiary.
- **Deferred (follow-up).** Per-page dynamic split of the three calculators (`/load-calculation`, `/equipment-selection`, `/airflow-duct-design`, 5 charts each) — their charts are primary content and secondary destinations, so `optimizePackageImports` is the better cost/risk trade for now.
- **P3 (optional, deferred) — framer-motion `LazyMotion`.** Revisit if profiling still shows motion weight after P1a/P1b.
- **Measure in production** (`npm run build && npm start`), not dev — dev on-demand compile (e.g. 1.6 s cold for the R3F viewer) is not a user-facing cost.

## Verification

Per step: full gate (`tsc`, `eslint`, `vitest`, `next build`) plus a before/after
check that the route still renders its charts and no hydration warnings appear.
