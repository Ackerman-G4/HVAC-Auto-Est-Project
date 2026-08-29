/**
 * Merge a validated project update onto the stored record.
 *
 * Extracted from the project route by REMEDIATION_PLAN.md TASK 3.2. The merge
 * was 60 lines inside a PUT handler, and it carries a rule with money
 * consequences: **changing any pricing input invalidates the stored bill of
 * quantities.** If that comparison is wrong, a quotation keeps being served
 * from figures the project no longer uses, and nothing anywhere reports it.
 */

import { wetBulb as calcWetBulb } from '@/lib/functions/psychrometric';
import { toInt, toNumber } from '@/lib/utils/api-helpers';

/**
 * A number that may be explicitly cleared.
 *
 * `null` and `undefined` mean different things on these fields: `null` is the
 * user removing an override, `undefined` is the field being absent from the
 * request. Collapsing them would make it impossible to clear an override.
 */
export function toNullableNumber(value: unknown, fallback: number | null): number | null {
  if (value === null) return null;
  if (value === undefined) return fallback;
  const parsed = toNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** The stored fields the merge reads and writes. */
export interface StoredProject {
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

/** Every field of the update body is optional; absent means "leave as stored". */
export type ProjectUpdateBody = Partial<Record<keyof StoredProject, unknown>>;

/** Two decimal places, which is the precision wet bulb is reported at. */
const WET_BULB_DECIMALS = 2;

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * What gets written. Wider than `StoredProject` by `outdoorWB`, which this
 * merge derives and never reads — so requiring callers to supply it would be a
 * lie about the input.
 */
export type ProjectUpdatePatch = StoredProject & { outdoorWB: number };

export interface ProjectUpdatePlan {
  readonly patch: ProjectUpdatePatch;
  /**
   * True when any of the eight pricing inputs moved. The caller uses this to
   * mark the bill of quantities stale and clear its generation timestamp.
   */
  readonly pricingChanged: boolean;
}

/**
 * Build the full record to store, and report whether pricing moved.
 *
 * Wet bulb is recomputed rather than accepted from the request: it is derived
 * from dry bulb and relative humidity, so taking it from the client would let
 * a caller store a psychrometrically impossible combination.
 */
export function buildProjectUpdate(
  body: ProjectUpdateBody,
  existing: StoredProject,
): ProjectUpdatePlan {
  const outdoorDB = toNumber(body.outdoorDB, existing.outdoorDB);
  const outdoorRH = toNumber(body.outdoorRH, existing.outdoorRH);

  const pricing = {
    suggestedLaborMultiplier: toNumber(body.suggestedLaborMultiplier, existing.suggestedLaborMultiplier),
    laborMultiplierOverride: toNullableNumber(body.laborMultiplierOverride, existing.laborMultiplierOverride),
    suggestedOverheadPercent: toNumber(body.suggestedOverheadPercent, existing.suggestedOverheadPercent),
    overheadPercentOverride: toNullableNumber(body.overheadPercentOverride, existing.overheadPercentOverride),
    suggestedContingencyPercent: toNumber(body.suggestedContingencyPercent, existing.suggestedContingencyPercent),
    contingencyPercentOverride: toNullableNumber(body.contingencyPercentOverride, existing.contingencyPercentOverride),
    suggestedVatRate: toNumber(body.suggestedVatRate, existing.suggestedVatRate),
    vatRateOverride: toNullableNumber(body.vatRateOverride, existing.vatRateOverride),
  };

  const pricingChanged = (Object.keys(pricing) as Array<keyof typeof pricing>).some(
    (key) => pricing[key] !== existing[key],
  );

  return {
    pricingChanged,
    patch: {
      name: (body.name as string) ?? existing.name,
      clientName: (body.clientName as string) ?? existing.clientName,
      buildingType: (body.buildingType as string) ?? existing.buildingType,
      location: (body.location as string) ?? existing.location,
      city: (body.city as string) ?? existing.city,
      totalFloorArea: toNumber(body.totalFloorArea, existing.totalFloorArea),
      floorsAboveGrade: toInt(body.floorsAboveGrade, existing.floorsAboveGrade),
      floorsBelowGrade: toInt(body.floorsBelowGrade, existing.floorsBelowGrade),
      outdoorDB,
      outdoorWB: roundTo(calcWetBulb(outdoorDB, outdoorRH), WET_BULB_DECIMALS),
      outdoorRH,
      indoorDB: toNumber(body.indoorDB, existing.indoorDB),
      indoorRH: toNumber(body.indoorRH, existing.indoorRH),
      safetyFactor: toNumber(body.safetyFactor, existing.safetyFactor),
      diversityFactor: toNumber(body.diversityFactor, existing.diversityFactor),
      ...pricing,
      // Stale is sticky: a pricing change sets it, and nothing here clears it.
      // Only a regeneration does that.
      isBoqStale: pricingChanged ? true : existing.isBoqStale,
      lastBoqGeneratedAt: pricingChanged ? null : existing.lastBoqGeneratedAt,
      notes: (body.notes as string) ?? existing.notes,
      status: (body.status as string) ?? existing.status,
    } as ProjectUpdatePatch,
  };
}
