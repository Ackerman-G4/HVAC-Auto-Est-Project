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
| 3 — Typography / copy | ✅ | See below. |
| 4 — Component library | 🟡 | Primitives built and tested; call-site migration pending. |
| 5 — Shell / layout | 🟡 | Nav/preference bugs fixed; RSC split deliberately deferred. |
| 6 — Page decomposition | 🟡 | Two largest targets already done pre-spec. |
| 7 — Motion doctrine | 🟡 | Only skeleton-shimmer loops; framer at 21 files, not 12. |
| 8 — 3D performance | 🟡 | Demand rendering + adaptive quality; viewer deletion blocked on parity. |
| 9 — Data / bundle | 🟡 | pdfmake/exceljs already lazy. |
| 10 — A11y / gates | 🟡 | jsx-a11y recommended on, 0 errors; 24 label warnings remain. |

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

### Wave 3 — typography and copy ✅

| Acceptance | Target | Result |
|---|---|---|
| `uppercase` usages | ≤ 20 | **0** ✅ |
| `--font-jakarta` / `--font-space-grotesk` | 0 | **0** ✅ |

**Poppins is gone.** A geometric humanist face with wide friendly counters is
the wrong voice for an estimation tool, and it was masquerading under
`--font-space-grotesk`. Display is now **IBM Plex Sans Condensed** — the
vernacular of the drawing title block and the equipment schedule. **IBM Plex
Mono** replaces JetBrains Mono so the app carries one mono face, not two.

**The font variables no longer lie.** `--font-jakarta` loaded Inter and
`--font-space-grotesk` loaded Poppins. The loaded faces are now `--face-body`,
`--face-display`, `--face-mono`, mapped onto Tailwind's `--font-sans` /
`--font-display` / `--font-mono` theme keys.

The `--face-*` naming is deliberate. Writing `--font-mono: var(--font-mono)` in
`@theme inline` is a self-reference; it only *appears* to work because next/font
re-declares the same name further down the cascade. Distinct names remove the
trap. (The same shape exists for `--radius-*` from Wave 2 and is safe there for
a different reason: `tokens.css` declares the literal unlayered, which beats
`@layer theme` regardless of order. Verified in the built CSS.)

**All 230 `uppercase` deleted**, along with the wide tracking that existed to
make caps legible. Every one was an eyebrow or section label whose source text
was already sentence case, so removing the CSS gave sentence case for free;
Condensed keeps them from growing. One genuine catch: `{run.source}` is a
lowercase enum (`internal`/`openfoam`) that was relying on the blanket rule to
display as caps, so it now sets `capitalize` explicitly.

**Numerals.** `CountUp` had no tabular figures at all — proportional digits
change width as they tick, so every animated number visibly jittered and shifted
whatever sat beside it. Now tabular at the primitive. BOQ quantity, unit price,
total and grand total were also untreated; a column of costs whose digits do not
align is unreadable.

**Copy and controls.** The dashboard's "No recent activity" was a dead end —
`EmptyState` already supports an action and it simply was not used; it now
invites creating a project. Buttons no longer rise 2px on hover (they should not
levitate in a data tool; `active:scale` stays, since press feedback reports
something real), and badges dropped `font-bold`.

Verified in the built output rather than assumed: all three faces load, the
theme keys resolve to them, and no Poppins or JetBrains request remains.

**Not verifiable from here:** how Condensed actually reads at label sizes, and
whether any label now wraps where it previously did not. Needs a browser.

### Wave 4 — component library 🟡

Full detail in [`ui-inventory.md`](./ui-inventory.md).

| Acceptance | Target | Result |
|---|---|---|
| Every primitive documented | yes | **`docs/ui-inventory.md`** ✅ |
| `@tanstack/react-table` imported | > 0 | **2 files** ✅ |
| `react-hook-form` / `@hookform/resolvers` imported | > 0 | **0** ❌ |
| No page file contains a raw `<table>` | 0 | **3 pages, 13 files** ❌ |

**Five new primitives**, each with the house rules applied once so page code
stops re-deriving them:

- **`Field`** — the fix for ~49 unassociated labels. Works with any control, and
  hands the wiring over through a render prop rather than cloning it on, because
  cloning fails silently when the child forwards no props — which is how labels
  come unassociated in the first place.
- **`DataTable`** — on `@tanstack/react-table`, which was installed and
  unimported. Sorting from a real `<button>` with `aria-sort`; several
  hand-rolled tables sorted from an `onClick` on the `<th>`, which no keyboard
  could reach. `meta.hideBelow` keeps responsive column hiding without dropping
  columns from the model, so sort and filter still see the data.
- **`TraceableValue`** — the §1.4 signature. Trigger is a real button so the
  derivation opens on focus, not hover alone; an audit trail behind hover is out
  of reach of anyone not using a mouse.
- **`Metric`**, **`Toolbar`** — numeric readouts and the search/filter strip.

**`PageHeader` already existed** in `page-wrapper.tsx`, so the spec's
`page-header.tsx` is covered rather than duplicated.

**Toast ids were a real bug.** `Date.now().toString()` meant two toasts raised
in the same millisecond collided on their React key, so React reconciled them as
one and a toast silently vanished — exactly what a form reporting several
validation failures at once does.

**`Button` gained `asChild`.** Without it, styling a link as a button means
nesting an `<a>` in a `<button>` (invalid, breaks keyboard activation) or
copying the class string, which call sites had begun doing.

27 tests across `field.test.tsx` and `data-table.test.tsx`. Writing them
surfaced that TanStack sorts numeric columns **descending-first** — the right
behaviour (clicking "Total" on a BOQ means "show me the biggest") but asymmetric
with text columns, so it is asserted explicitly rather than left as a surprise.

#### What is not done

`MaterialsTable` is migrated and gained sorting it never had, which proves the
primitive in production. The remaining migrations are deliberately not done:

- **13 files still hand-roll a `<table>`**, 3 of them page files.
- **`htmlFor` is still 6 against 55 `<label>`s** — `Field` is what closes that,
  one form at a time.
- **`react-hook-form` is still unimported.** The natural first migration is
  `projects/new/page.tsx`, 361 lines of hand-rolled `useState` form with
  cross-field validation, on the path that creates a user's project. Rewriting
  its validation without being able to click through it risks losing data on a
  path where that matters, so it wants a browser rather than a blind rewrite.

**Not verifiable from here:** that the migrated materials table still reads
correctly at each breakpoint, and that `TraceableValue`'s card positions
sensibly near a viewport edge.

### Wave 5 — shell and layout 🟡

| Acceptance | Target | Result |
|---|---|---|
| `'use client'` in `components/layout/` | halved | **unchanged** ❌ (deferred, see below) |
| Every route usable at 390×844 | all | **engine now stacks**; unverified visually |
| No horizontal page scroll | none | no fixed `w-[NNNpx]` remain in pages |

**A real bug: nav groups shared one open flag.** `renderNavGroup` read a single
`estimationOpen` for *every* group, so toggling "CFD Simulation" also opened and
closed "Estimation". Now keyed per group and persisted.

**The sidebar discarded the user's choice.** The shell applied a width-based
default on every breakpoint crossing, so expanding the sidebar at 1200px and
then resizing snapped it shut — and reloading lost it entirely. The responsive
default is now advisory: `applyResponsiveSidebar` is skipped once the user has
set it themselves, and the preference persists. Verified by mutation.

**Route matching is segment-bounded.** `pathname.startsWith(href)` also
highlights `/projects` for `/projects-archive`. **No route in the app collides
today**, so this is hardening rather than a fix for something visible — worth
saying plainly, because the spec presented it as a live defect.

**The engine page had no mobile layout**, and decomposition had not changed
that: its five components carry zero responsive classes between them, and the
three panels are 320px + fluid + 256px, so a phone simply overflowed sideways.
It now stacks below `xl`, with `min-w-0` on the centre panel so it can shrink
rather than force overflow. The Guided/Pro pill also explains what it changes.

#### Why the RSC split is deferred

The spec's headline Wave 5 item is splitting `AppShell` into a server shell plus
a thin client, which is what unblocks Wave 9's RSC migration. It is not done.

`AppShell` currently owns auth initialisation, the boot gate, and theme
adoption. Moving auth to the server means reading the httpOnly cookie in a
server component and changing how every route obtains the user — a change to
the login and session path. That path cannot be exercised here: there is no
browser to log in with, and a regression would lock the user out of their own
app rather than merely look wrong.

Five waves of visual change have already landed without being seen. Adding an
unverifiable auth refactor on top is the wrong order. This wants a browser
first.

### Waves 7, 8, 10 — motion, 3D, accessibility 🟡

#### Wave 7 — motion doctrine

| Acceptance | Target | Result |
|---|---|---|
| Infinite animations (excl. skeleton) | 0 | **0** ✅ |
| Inline durations/easings | 0 | **0** ✅ |
| `framer-motion` files | ≤ 12 | **21** ❌ |

Removed `stage-pulse`/`.stage-running`, an infinite opacity pulse with zero call
sites. The floorplan spinner was one infinite rotation driven through
framer-motion — a spinner *does* report something, so it stays, but as CSS, and
it gained `role="status"` (it was announcing nothing). Six hardcoded durations
now come from `lib/ui/motion.ts`, which already defined 150/250/400ms.

The viewer's cooling-deficit alert moved to CSS and gained `role="alert"` — it
appears when a deficit does, and that is not something to surface silently.

`framer-motion` is at 21, not 12. What remains is `AnimatePresence` exits,
drawer/dialog orchestration and the page transition, none of which CSS can do.
The stagger grids on `/projects` and `SupplierGrid` are decoration by the
doctrine's own test, but converting orchestrated stagger to CSS is fiddly and
purely visual, and this branch cannot check the result.

#### Wave 8 — 3D performance

`SimulationCanvas` renders **on demand** instead of at 60fps forever. Safe there
specifically because none of its layers uses `useFrame`, so nothing continuously
animating gets starved; drei's `OrbitControls` calls `invalidate()` on change.

`AirflowViewer3D` keeps the continuous loop deliberately — it and `CFDOverlay3D`
run **seven** `useFrame` loops driving particles and streamlines, which
demand-mode would freeze. It gets `AdaptiveDpr`/`AdaptiveEvents` instead.

`preserveDrawingBuffer` was on unconditionally, making the driver retain a copy
of every frame. Only the TileFlow tab calls `captureSnapshot()`, so it is now an
opt-in prop that only that tab sets.

**The legacy viewer deletion is not done, and should not be.** The plan's own
precondition is finishing the R3F parity checklist. `CFDOverlay3D` exports eight
render layers — HeatmapSlice, VelocityArrows, AirflowParticles,
ContourSlicePlane, Streamlines, TemperatureFog, TileAirflowOverlay,
AlertZoneMarkers — against three on the R3F side. Deleting the legacy stack today
removes six capabilities the viewer's own tabs render. That is a feature
deletion dressed as a refactor; reaching parity means writing six new R3F layers
whose output cannot be checked from here.

#### Wave 10 — accessibility and gates

| Acceptance | Target | Result |
|---|---|---|
| `jsx-a11y` errors | 0 | **0** ✅ |
| CI gate | yes | **`.github/workflows/frontend-gates.yml`** ✅ |

Turning on the recommended jsx-a11y set surfaced **42 violations** that the
Next.js default config was not checking for. 18 fixed:

- **Project cards were mouse-only.** A `<div onClick>` calling `router.push`:
  no focus, no Enter key, nothing in the tab order, and no way to open a project
  in a new tab. Now a `Link`.
- `ConfigPanel` (10) and `FailurePanel` (3) migrated onto `Field`. Their labels
  had `aria-label` duplicating the visible text, so screen readers worked but
  clicking a label focused nothing. FailurePanel's "select failed units" was a
  `<label>` over a *group* — now `fieldset`/`legend`, which is the pair that
  actually names one.
- `CardTitle` took children through a prop spread, so an empty `<h3>` could ship
  unnoticed; children is explicit now.
- Redundant `role="list"`/`role="listitem"` on `<ol>`/`<li>` removed.

**24 remain, all `label-has-associated-control`** — a hand-rolled control beside
a label with no `htmlFor`. Every other a11y rule is now an **error**, so new
breakage in those fails the build. This one is a warning because it is a
migration onto `Field`, not a config question: making it an error today would
mean per-file disables, which hides the same debt somewhere harder to count.
`ConfigPanel` and `FailurePanel` are the worked examples.

The CI workflow runs `npm run check` (types + lint + tests), `next build`, and a
bundle budget set above today's figure so it catches regressions rather than
failing on the debt the overhaul is still working through.

**Not verifiable from here:** a real keyboard walkthrough, screen-reader output,
and whether demand rendering actually leaves the canvas idle. All need a browser.
