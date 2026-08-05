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
| 2 — Token / surface reset | 🟡 | Surfaces/radius/blur done; hex purge partial — see below. |
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

### Wave 2 — token and surface reset 🟡

| Acceptance | Target | Result |
|---|---|---|
| `backdrop-blur` usages | ≤ 6 | **6** ✅ |
| `rounded-(xl\|2xl\|3xl\|md)` | 0 | **0** ✅ |
| Translucent surface tokens | 0 | **0** ✅ |
| Infinite decorative animations | 0 | **0** ✅ |
| Hardcoded hex in `.tsx` | 0 | **205** (from 227) ❌ |
| CSS bundle | ≤ 90 KB | **126 KB** (from 128) ❌ |

**Surfaces are opaque.** Every surface token was a translucent `rgba()`, so 127
surfaces floated over whatever happened to be behind them. Each is now the
former colour *composited over the ground it actually sat on*, so the palette
reads the same while nothing is see-through. The only surviving `rgba` values
are shadows and the five overlay tokens.

**Blur is overlay-only**, 30 → 6: dialog scrim, command palette, toasts, mobile
drawer, shortcuts sheet, onboarding tour. Everything else was a compositing
layer for decoration, including four over the 3D canvas.

**Radius is three steps.** The scale in `tokens.css` was never wired into
Tailwind's `@theme`, so the `rounded-*` utilities used Tailwind's defaults and
the tokens did nothing — which is how 463 usages drifted across six values.
Now wired, and 416 usages codemodded to sm/md/lg (208/168/49) plus `rounded-full`
for pills. `--radius-control`, referenced by two rules, was never defined at
all; it is now an alias for `--radius-sm`.

**Deleted:** the `.canvas-ambient` 26s infinite drift (its reference grid
stays — that earns its place), the `.cta-glow` 2.6s breathe on an idle button
(now the static ring its own reduced-motion branch already fell back to), both
body radial gradients, and the accent wash on `.surface-recessed`.

**The black hole is fixed.** `SimulationCanvas` and `AirflowViewer3D` set their
scene background from JS with hardcoded `#0b1013` / `#0f172a`, so the canvas
stayed near-black in light mode. New `--canvas-bg` token defined in *both*
themes, read through `useThemeColor` — an effect, so it re-resolves on theme
change rather than caching one value. `toThreeColor` guards the case where the
browser hands back `oklch()`/`color-mix()`, which three.js throws on.

**Also deleted `PsychrometricChart.tsx`** — zero consumers, and the only
client-side importer of `rule-evaluator`, which pulls in mathjs. 22 of the hex
went with it.

#### Why hex is 205, not 0

Two categories genuinely should not be tokens, and blanket-converting them would
be wrong rather than incomplete:

- **`layout.tsx` (1)** — `themeColor` in viewport metadata becomes a
  `<meta name="theme-color">` tag. Meta content cannot reference a CSS variable.
- **`global-error.tsx` (4)** — Next.js renders this when the root layout itself
  has crashed, which is exactly when the stylesheet may not have loaded. Its
  inline hex is the reason it still renders.

The remaining ~200 sit in four canvas/3D files (`BuildingViewer3D` 55,
`FloorPlanMultiView` 37, `floorplan/preview` 32, `AirflowViewer3D` 25) plus
small chart palettes. These are **categorical and sequential data palettes** —
space-type fills, temperature ramps. Per the spec's own rule ("color as data"),
they encode data, and a temperature ramp that shifted with the theme would be
worse, not better. The right treatment is consolidating them into one documented
palette module rather than converting them to theme tokens, and that is a
focused change to renderers whose output cannot be checked from here. Left for
a follow-up rather than done blind.

The CSS bundle barely moved (128 → 126 KB) because the weight is Tailwind's
generated utilities, not the token layer. Getting under 90 KB needs the Wave 3/4
class-surface reduction, not more token work.

Covered by `lib/ui/__tests__/css-var.test.ts` (11), which pins the fallback
behaviour — these run during SSR and before the stylesheet applies, and a wrong
fallback is precisely the bug being fixed.

**Not verifiable from here:** that the opaque palette still reads correctly, and
that the 3D canvases now sit on a light background in light mode. Both need a
browser.
