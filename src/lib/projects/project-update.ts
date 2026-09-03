/**
 * Merging an update request onto a stored project.
 *
 * Extracted from `projects/[id]/route.ts` (TASK 3.2), where 58 lines of
 * field-by-field merging sat inside the PUT handler. Deciding which fields a
 * partial update replaces, and what that implies for the bill of quantities, is
 * a domain policy rather than an HTTP concern (CLAUDE.md rule 7).
 *
 * The module is pure — no store, no request — so the staleness invariant below
 * can be asserted directly.
 */

import { toNumber, toInt } from '@/lib/utils/api-helpers';
import { wetBulb } from '@/lib/functions/psychrometric';
import type { UpdateProjectBody } from '@/lib/validation/projects';

/**
 * The stored fields a merge reads.
 *
 * Declared structurally rather than importing the full record type, so this
 * module stays independent of the persistence layer.
 */
export interface ExistingProject {
  name: string;
  clientName: string;
  buildingType: string;
  location: string;
  city: string;
  totalFloorArea: number;
  floorsAboveGrade: number;
  floorsBelowGrade: number;
  outdoorDB: number;
  outdoorRH: number;
  indoorDB: number;
  indoorRH: number;
  safetyFactor: number;
  diversityFactor: number;
  suggestedLaborMultiplier: number;
  laborMultiplierOverride: number | null;
  suggestedOverheadPercent: number;
  overheadPercentOverride: number | null;
  suggestedContingencyPercent: number;
  contingencyPercentOverride: number | null;
  suggestedVatRate: number;
  vatRateOverride: number | null;
  isBoqStale: boolean;
  lastBoqGeneratedAt: string | null;
  notes: string;
  status: string;
}

/**
 * Resolve a nullable numeric field.
 *
 * Three cases, and the distinction between the first two is the point:
 * `null` clears an override deliberately, `undefined` means the request said
 * nothing and the stored value stands. Collapsing them — as `?? fallback`
 * would — makes it impossible to ever remove an override.
 */
export function toNullableNumber(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (value === undefined) return fallback;
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The four dual-control rates, resolved from request and stored values. */
interface ResolvedRates {
  suggestedLaborMultiplier: number;
  laborMultiplierOverride: number | null;
  suggestedOverheadPercent: number;
  overheadPercentOverride: number | null;
  suggestedContingencyPercent: number;
  contingencyPercentOverride: number | null;
  suggestedVatRate: number;
  vatRateOverride: number | null;
}

function resolveRates(body: UpdateProjectBody, existing: ExistingProject): ResolvedRates {
  return {
    suggestedLaborMultiplier: toNumber(body.suggestedLaborMultiplier, existing.suggestedLaborMultiplier),
    laborMultiplierOverride: toNullableNumber(body.laborMultiplierOverride, existing.laborMultiplierOverride),
    suggestedOverheadPercent: toNumber(body.suggestedOverheadPercent, existing.suggestedOverheadPercent),
    overheadPercentOverride: toNullableNumber(body.overheadPercentOverride, existing.overheadPercentOverride),
    suggestedContingencyPercent: toNumber(
      body.suggestedContingencyPercent,
      existing.suggestedContingencyPercent,
    ),
    contingencyPercentOverride: toNullableNumber(
      body.contingencyPercentOverride,
      existing.contingencyPercentOverride,
    ),
    suggestedVatRate: toNumber(body.suggestedVatRate, existing.suggestedVatRate),
    vatRateOverride: toNullableNumber(body.vatRateOverride, existing.vatRateOverride),
  };
}

/**
 * Has any rate that scales a currency total actually changed?
 *
 * Compared field by field against the stored values rather than checking
 * whether the request merely mentioned them: a client that echoes the whole
 * project back unchanged — which the edit form does — must not invalidate a
 * bill that is still correct.
 */
export function pricingRatesChanged(rates: ResolvedRates, existing: ExistingProject): boolean {
  return (
    rates.suggestedLaborMultiplier !== existing.suggestedLaborMultiplier
    || rates.laborMultiplierOverride !== existing.laborMultiplierOverride
    || rates.suggestedOverheadPercent !== existing.suggestedOverheadPercent
    || rates.overheadPercentOverride !== existing.overheadPercentOverride
    || rates.suggestedContingencyPercent !== existing.suggestedContingencyPercent
    || rates.contingencyPercentOverride !== existing.contingencyPercentOverride
    || rates.suggestedVatRate !== existing.suggestedVatRate
    || rates.vatRateOverride !== existing.vatRateOverride
  );
}

export interface ProjectPatch extends ResolvedRates {
  name: string;
  clientName: string;
  buildingType: string;
  location: string;
  city: string;
  totalFloorArea: number;
  floorsAboveGrade: number;
  floorsBelowGrade: number;
  outdoorDB: number;
  outdoorWB: number;
  outdoorRH: number;
  indoorDB: number;
  indoorRH: number;
  safetyFactor: number;
  diversityFactor: number;
  isBoqStale: boolean;
  lastBoqGeneratedAt: string | null;
  notes: string;
  status: string;
}

export interface BuiltProjectPatch {
  patch: ProjectPatch;
  /** True when a rate changed, which is what invalidates the stored bill. */
  pricingChanged: boolean;
}

/**
 * Build the full record to write for a partial update.
 *
 * Wet bulb is derived rather than accepted from the client: it is fixed by dry
 * bulb and relative humidity, so taking it as input would let the three drift
 * out of agreement and silently corrupt every latent load computed from them.
 *
 * When a pricing rate changes the bill is marked stale and its generation
 * timestamp cleared, because a stored bill priced at the old rates is no longer
 * the bill this project describes. Clearing the timestamp as well as setting
 * the flag matters: the UI reads the timestamp to say when the bill was last
 * generated, and leaving it would date a bill that has been invalidated.
 */
export function buildProjectPatch(
  body: UpdateProjectBody,
  existing: ExistingProject,
): BuiltProjectPatch {
  const outdoorDB = toNumber(body.outdoorDB, existing.outdoorDB);
  const outdoorRH = toNumber(body.outdoorRH, existing.outdoorRH);
  const rates = resolveRates(body, existing);
  const pricingChanged = pricingRatesChanged(rates, existing);

  return {
    pricingChanged,
    patch: {
      name: body.name ?? existing.name,
      clientName: body.clientName ?? existing.clientName,
      buildingType: body.buildingType ?? existing.buildingType,
      location: body.location ?? existing.location,
      city: body.city ?? existing.city,
      totalFloorArea: toNumber(body.totalFloorArea, existing.totalFloorArea),
      floorsAboveGrade: toInt(body.floorsAboveGrade, existing.floorsAboveGrade),
      floorsBelowGrade: toInt(body.floorsBelowGrade, existing.floorsBelowGrade),
      outdoorDB,
      outdoorWB: Math.round(wetBulb(outdoorDB, outdoorRH) * 100) / 100,
      outdoorRH,
      indoorDB: toNumber(body.indoorDB, existing.indoorDB),
      indoorRH: toNumber(body.indoorRH, existing.indoorRH),
      safetyFactor: toNumber(body.safetyFactor, existing.safetyFactor),
      diversityFactor: toNumber(body.diversityFactor, existing.diversityFactor),
      ...rates,
      isBoqStale: pricingChanged ? true : existing.isBoqStale,
      lastBoqGeneratedAt: pricingChanged ? null : existing.lastBoqGeneratedAt,
      notes: body.notes ?? existing.notes,
      status: body.status ?? existing.status,
    },
  };
}
