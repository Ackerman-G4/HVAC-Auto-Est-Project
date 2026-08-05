# UI primitive inventory

What exists in `src/components/ui/`, what each is for, and how to use it. If a
pattern is here, page code should not hand-roll it — that is how the app ended
up with ~49 unassociated labels and a different table implementation per page.

## New in Wave 4

### `Field` — label + control + hint + error

The fix for unassociated labels. `Input`/`Select`/`Textarea` already wire
`htmlFor`, ids and `aria-describedby` correctly; the broken labels are all
hand-rolled markup that bypassed them, usually because the control needed custom
styling or a unit suffix. `Field` works with **any** control.

The wiring is handed to the child through a render prop rather than cloned onto
it. Cloning fails silently when the child forwards no props — which is exactly
how labels come unassociated in the first place.

```tsx
<Field label="Room area" unit="m²" hint="Gross internal area" required>
  {(f) => <input {...f} value={area} onChange={(e) => setArea(e.target.value)} />}
</Field>

// react-hook-form
<Field label="Email" error={errors.email?.message}>
  {(f) => <input {...f} {...register('email')} />}
</Field>
```

Handles: unique id per instance, `aria-describedby` pointing at hint *or* error
(never at text that is not rendered), `aria-invalid`, `aria-required`,
`role="alert"` on the error so it is announced when it appears, and a required
asterisk that is `aria-hidden` so the field is not announced as "Area star".

### `DataTable` — the table every dense list should use

Built on `@tanstack/react-table`, which was installed and unimported. House
rules applied once: numeric columns right-aligned and tabular, sticky opaque
header, sorting from a real `<button>` with `aria-sort` on the header cell, row
density from `--table-row-height`, and horizontal scroll contained so the page
never scrolls sideways.

```tsx
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Material' },
  { accessorKey: 'qty', header: 'Qty', meta: { numeric: true } },
  { accessorKey: 'spec', header: 'Specification', meta: { hideBelow: 'md' } },
];

<DataTable data={rows} columns={columns} searchPlaceholder="Search materials" />
```

`meta.hideBelow` hides a column below a breakpoint **without** removing it from
the model, so sorting and filtering still see the data. Every table it replaces
did this by hand; losing it would make them unusable on a phone.

**Numeric columns sort largest-first on the first click** (TanStack's default,
and the right one — clicking "Total" on a BOQ means "show me the biggest"). Text
columns sort A–Z first. The asymmetry is deliberate and pinned by a test.

### `TraceableValue` — the signature

A computed figure you can interrogate: jade hairline underline, and hover or
focus reveals the inputs, method and assumptions behind it. Click to pin.
Nothing else in the app gets a jade underline.

```tsx
<TraceableValue
  method="ASHRAE RTS, 3% safety factor applied"
  inputs={[{ label: 'Floor area', value: '240 m²' }, { label: 'Occupants', value: '24' }]}
  assumptions={['Occupancy 0.1 person/m²']}
  unit="kW"
>
  42.8
</TraceableValue>
```

The trigger is a real `<button>`, so the card opens on focus and closes on
Escape — a hover-only disclosure would put the audit trail out of reach of
anyone not using a mouse. Supersedes `TermHint` and `DualValueExplainer`, which
are the half-built ancestors of this idea and still have call sites.

### `Metric` — label + value + unit + delta

Numeric readout with the unit typeset separately so a column lines up on the
digits rather than the unit string. Values are tabular by construction.

```tsx
<Metric label="Total cooling load" value="128.4" unit="kW" delta={-4.2} invertDelta />
```

`invertDelta` for figures where rising is the bad outcome (cost, energy). The
direction arrow is rendered alongside the colour so the sign is readable without
relying on hue.

### `Toolbar` — search / filter / actions strip

`/projects` and `/materials` each hand-rolled this, which is how their search
inputs ended up with different heights and no labels. The search field is
labelled rather than relying on the placeholder — placeholder text disappears
the moment someone types, so it is not a name.

```tsx
<Toolbar
  searchValue={query}
  onSearchChange={setQuery}
  searchPlaceholder="Search projects"
  actions={<Button>New project</Button>}
>
  <CategoryFilter />
</Toolbar>
```

## Revised in Wave 4

| Component | Change |
|---|---|
| `Button` | Added `asChild` so `<Link>` can render as a button without nesting an `<a>` in a `<button>` (invalid, and it breaks keyboard activation). Hover lift removed in Wave 3. |
| `Toast` | Ids were `Date.now().toString()`, so two toasts raised in the same millisecond collided on their React key and one silently vanished — exactly what a form reporting several validation failures does. Now `crypto.randomUUID()` with a counter fallback for non-secure contexts. |
| `EmptyState` | `py-20` → `py-12`; opaque surface. It already supported an `action` — the dashboard's dead-end "No recent activity" simply never passed one. |
| `Badge` | `font-bold` → `font-medium`; uppercase removed in Wave 3. |
| `Card` | Opaque (Wave 2). |
| `Input` / `Select` / `Tabs` | Blur removed, radius aligned (Wave 2). a11y wiring was already correct and is untouched. |
| `Dialog` | Focus trap untouched — it is correct, including shift-tab wraparound. Keeps its scrim blur, which is a legitimate overlay. |

## Existing, unchanged

`PageHeader` and `PageWrapper` already live in `page-wrapper.tsx` and cover the
spec's `page-header.tsx` ask. `StatCard`, `Skeleton`, `SectionLabel`,
`CommandPalette`, `ShortcutsSheet`, `AutosaveIndicator`, `CountUp` (now tabular).

## Not yet migrated

The primitives exist and are proven, but most call sites still hand-roll:

- **Tables** — `MaterialsTable` is migrated to `DataTable` and gained sorting it
  never had. 13 other files still contain a raw `<table>`, 3 of them page files.
- **Labels** — `htmlFor` is at 6 against 55 `<label>` elements. `Field` is what
  closes that gap, one form at a time.
- **Forms** — `projects/new/page.tsx` is 361 lines of hand-rolled `useState`
  form and is the natural first migration; `zod` schemas already exist in
  `src/lib/validation/`. `react-hook-form` and `@hookform/resolvers` were
  **removed in Wave 9**: they had sat installed and unimported, and carrying a
  dependency against a migration nobody has started is just supply-chain surface.
  Reinstall them when that form is actually migrated — `Field`'s render prop
  spreads onto `register()` unchanged, so nothing here needs to move first.
