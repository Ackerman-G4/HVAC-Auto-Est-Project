# Overhaul v3 — Wave 1 Results & Handoff
**Base:** `main-backup2` @ `05d6df2` · **Branch:** `overhaul-v3` · 4 commits · 28 files · +2,078 / −54

## How to apply
```bash
git checkout main-backup2
git checkout -b overhaul-v3
git apply overhaul-v3-wave1.patch
npm install   # no new deps — just ensures lockfile state
npx tsc --noEmit && npx eslint src && npx vitest run && npm run build
git add -A && git commit -m "overhaul-v3: wave 1 (phases 0, 5.1, 4.3, 4.2)"
```

## Verified gates (all green in this wave)
- `tsc --noEmit` clean · `eslint` 0 errors · `vitest` **46/46** (was 41) · `npm run build` succeeds (fonts stubbed offline-only; no code change shipped for that)

## Shipped

### Phase 0 — Golden money-path tests ✅
`src/lib/engine/__tests__/golden-money-path.test.ts` + `golden/fixtures.json` (736 lines of frozen numbers). Locks `calculateCoolingLoad` (office/server/retail fixtures), `calculateEquipmentSelection` (economy/balanced/premium cases), `compileBOQ`, `calculateTotalProjectCost`. Deterministic across runs (volatile `timestamp`/`generatedAt` fields normalized out). **Re-baselining requires deleting fixtures.json — never do this silently.**

### Phase 5.1 — Resilience layer ✅ (0 → 20 files)
Root `error.tsx` / `global-error.tsx` / `not-found.tsx`; segment `error.tsx` for simulation, project detail, floorplan; 14 route `loading.tsx` files backed by `src/components/ui/route-skeletons.tsx` (PageHeader/StatRow/DataTable/CardGrid/Workspace/Detail skeleton shapes).

### Phase 4.3 — Command palette ✅
`src/components/ui/command-palette.tsx`, zero deps. Ctrl/Cmd+K, fuzzy match (word-start + consecutive-hit scoring), 12 nav targets + live projects + actions (New Project, theme toggle), persisted recents, full keyboard nav, reduced-motion aware, mounted in `app-shell.tsx`; the header's decorative ⌘K chip is now the real trigger.

### Phase 4.2 — WorkflowRail ✅
`src/components/ui/workflow-rail.tsx`: Floorplan → Loads → Equipment → Ducting → BOQ → Quotation → Reports with per-stage status (not started / in progress / done / **stale**), animated progress track, pure `deriveWorkflowStages()` helper. Wired into `projects/[id]/page.tsx`; `isBoqStale` drives stale badges on BOQ + Quotation.

### Phase 3.1 — Motion system: already existed
Audit found `src/lib/ui/motion.ts` (durations/easing/reduced-motion hook) and `src/animations/` (list/modal/page variants) already implement the shared system. No churn shipped. Remaining motion work is *adoption* in the 3 pages still defining inline variants (`materials`, `projects`, `projects/[id]`).

## Remaining (run MASTER-PLAN-v3.md in Claude Code, skipping what's marked done)
1. **Phase 1 — the big consolidation:** 3 simulation pages → 1 (`viewer` 2,209 + `engine` 1,641 + `workspace` 700), merge the two sim stores (785 + 852), decompose `projects/[id]` (2,180), `floorplan` (1,921), `materials` (1,098), `reports` (1,077) into `src/features/`. Golden tests must stay green throughout.
2. **Phase 2:** per-page design sweep checklist (23 pages), dashboard command-center rebuild, auth page redesign, breadcrumbs everywhere.
3. **Phase 4 remainder:** project wizard (4.1), CalcBreakdown "explain the numbers" drawers (4.4), autosave indicator (4.5), onboarding tour (4.6), shortcuts sheet (4.7).
4. **Phase 5 remainder:** `next/dynamic` splitting for R3F/fabric/pdfmake/exceljs, API error-envelope pass.
5. **Phase 6:** engine unit tests to ≥60 cases + `docs/engine-invariants.md`.
6. **Phase 7:** admin console rebuild, diagnostics health board, README/architecture docs, `npm run check` script.

## Notes for Claude Code
- WorkflowRail's `activeStage` is hardcoded `"boq"` on project detail — make it reflect the active tab when decomposing that page.
- `ductsSized` heuristic scans BOQ sections for "duct" — replace with a real flag once duct results are persisted per-project.
- Palette caps at 25 projects; add search-server-side if catalogs grow.
