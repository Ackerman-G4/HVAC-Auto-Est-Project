# Frontend overhaul — baseline

Instrumentation for `HVAC_STUDIO_FRONTEND_OVERHAUL.md`. Numbers are re-measured
on **`main` @ `ab66c3a`**, not taken from the spec.

## Why the spec's numbers were re-measured

The spec was audited against `main-backup2` @ `95e01e2`. `main` has since taken
the whole MASTER-PLAN-v3 overhaul, so a chunk of Section 0 is already resolved
and acting on it as written would mean redoing finished work. The re-measure
below separates what is still true from what is not.

### Already resolved on `main` — do not re-do

| Spec finding | Spec | Now |
|---|---|---|
| `simulation/viewer/page.tsx` | 1672 lines | **283** (decomposed to `features/simulation/viewer/`) |
| `simulation/engine/page.tsx` | 1641 lines | **226** (decomposed to `features/simulation/engine/`) |
| `simulation/workspace/page.tsx` | 700 lines | **deleted** — route redirects to `/simulation/viewer` |
| `BuildingSimulationViewer3D.tsx` | 216 lines | **deleted** (zero references) |
| Largest `page.tsx` | 1672 lines | **856** (`projects/page.tsx`) |
| Test cases | not measured | **6 → 141** |

Wave 6 is therefore roughly half-done already: its two largest targets are gone.
`projects/page.tsx` (856), `floorplan/preview/page.tsx` (783) and
`quotation/page.tsx` (623) remain.

### Still true — the spec stands

| Metric | Spec | Re-measured | Target |
|---|---|---|---|
| Total client JS (raw) | 7.81 MB | **8.03 MB** | — |
| Total client JS (gzipped) | 2.49 MB | **2.56 MB** | ≤ 1.2 MB |
| Chunks | 77 | **78** | — |
| Largest single chunk | 952 KB | **952 KB** | ≤ 250 KB |
| Chunks over 800 KB | 4 | **4** | 0 |
| CSS bundle | 116 KB | **128 KB** (113 + 16) | ≤ 45 KB |
| `'use client'` files | 108 | **117** | < 60 |
| `backdrop-blur` usages | 33 | **30** | ≤ 6 |
| `glass-card` / `panel-glass` | 132 | **127** | ≤ 6 |
| Hardcoded hex in `.tsx` | 244 | **231** | 0 |
| `uppercase` usages | 231 | **232** | ≤ 20 |
| `<label>` elements | 57 | **55** | — |
| `htmlFor` attributes | 4 | **6** | ≈ label count |
| `React.memo` usages | 0 | **0** | — |

`'use client'` went *up* (108 → 117) because decomposition split large client
pages into more client files. The count is a proxy for the RSC migration, which
has not started; the underlying problem is unchanged.

The four >800 KB chunks are **pdfmake (952 KB)**, **exceljs (909 KB)**,
**three (841 KB)** and one unidentified (835 KB). pdfmake and exceljs are
already behind `await import(...)` and so are lazy, not first-load — Wave 9's
item 4 is done. The remaining question for those two is total weight, not
placement.

## Measuring

```bash
npm run analyze          # bundle analyzer (@next/bundle-analyzer)
```

Re-run the metric commands in Appendix B of the spec to compare against the
table above.

## Wave log

| Wave | Status | Notes |
|---|---|---|
| 0 — Instrumentation | ✅ | This document; `npm run analyze`. |
| 1 — Kill the ceremony | ✅ | See below. |
| 2 — Token / surface reset | ⬜ | |
| 3 — Typography / copy | ⬜ | |
| 4 — Component library | ⬜ | |
| 5 — Shell / layout | ⬜ | |
| 6 — Page decomposition | 🟡 | Two largest targets already done pre-spec. |
| 7 — Motion doctrine | 🟡 | Wave 1 removed the worst offenders. |
| 8 — 3D performance | ⬜ | |
| 9 — Data / bundle | 🟡 | pdfmake/exceljs already lazy. |
| 10 — A11y / gates | ⬜ | |

### Wave 1 — kill the ceremony ✅

Roughly **3.3s of manufactured waiting** removed from cold load.

| Removed | Was |
|---|---|
| Boot delay | `setTimeout(() => setBootReady(true), 1100)` gated the entire app on a timer, regardless of whether anything was loading |
| Fake progress bar | Looped 22% → 54% → 81% → 100% every 2.2s, forever, tracking nothing |
| Cycling status strings | Three fictional messages rotating every 850ms |
| Counter-rotating rings | 16s and 12s infinite |
| Marching dots | 1.1s infinite, five of them |
| Welcome overlay | Auto-closed after 2200ms; blocked the app on arrival |

Replaced with a skeleton of the shell that is about to appear — a sidebar rail
and header bar. That is honest, and it makes the transition read as the page
settling rather than swapping.

Also in this wave:

- **Theme flash fixed.** `<html data-theme="dark">` was hardcoded and corrected
  from `localStorage` in a post-hydration effect, so every light-theme user
  watched a dark-to-light flash on each load. A blocking script in `<head>`
  now resolves it before first paint. The store adopts that value on mount and
  only writes on subsequent *changes* — writing before adoption would repaint
  with the default and reintroduce the flash.
- **Command palette opens by action.** The header button dispatched a fabricated
  `new KeyboardEvent('keydown', {key:'k', metaKey:true})` and relied on the
  palette's window listener catching it. Visibility now lives in `ui-store`.
  This also fixed a latent bug: the per-open reset lived in the hotkey handler,
  so opening from the button reopened the palette with the previous query still
  in it.
- **Resize listener → `matchMedia`.** The old `resize` handler ran on every tick
  of a window drag and pushed two store writes each time. `matchMedia` fires
  only on threshold crossings.
- **Dead user chip → link.** It was a `<button>` with no handler: it looked
  clickable and did nothing. Now links to `/settings`.
- `h-screen` / `min-h-screen` → `h-dvh` / `min-h-dvh` (mobile browser chrome).
- Deleted the five unused Next.js starter SVGs, and the now-orphaned
  `hvac-show-welcome` sessionStorage writes in login/register.

Covered by `components/layout/__tests__/boot-gating.test.tsx` (5) and
`stores/__tests__/command-palette-store.test.ts` (4). The boot test installs
fake timers and never advances them, so a reintroduced delay cannot satisfy it —
verified by mutation.

**Not verifiable from here:** the actual cold-load timing improvement and the
absence of a visible theme flash both need a browser. The 1.1s is removed by
construction (the timer is gone); the flash fix needs a throttled reload in both
themes to confirm.
