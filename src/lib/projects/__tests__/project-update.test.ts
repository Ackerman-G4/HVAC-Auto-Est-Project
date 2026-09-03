import { describe, expect, it } from 'vitest';
import {
  buildProjectPatch,
  toNullableNumber,
  type ExistingProject,
} from '../project-update';
import type { UpdateProjectBody } from '@/lib/validation/projects';

/**
 * Merging a partial update onto a stored project.
 *
 * Extracted from a 282-line route handler (TASK 3.2), where it was reachable
 * only through an authenticated request. Two rules in here decide whether a
 * quotation stays trustworthy — the staleness invariant and the
 * null-versus-absent distinction on overrides — and neither had a test.
 */

function existing(overrides: Partial<ExistingProject> = {}): ExistingProject {
  return {
    name: 'Ayala Tower',
    clientName: 'Ayala Land',
    buildingType: 'office',
    location: 'Makati',
    city: 'Makati',
    totalFloorArea: 1200,
    floorsAboveGrade: 8,
    floorsBelowGrade: 2,
    outdoorDB: 34,
    outdoorRH: 70,
    indoorDB: 24,
    indoorRH: 50,
    safetyFactor: 1.1,
    diversityFactor: 0.9,
    suggestedLaborMultiplier: 0.35,
    laborMultiplierOverride: null,
    suggestedOverheadPercent: 0.15,
    overheadPercentOverride: null,
    suggestedContingencyPercent: 0.05,
    contingencyPercentOverride: null,
    suggestedVatRate: 0.12,
    vatRateOverride: null,
    isBoqStale: false,
    lastBoqGeneratedAt: '2026-01-01T00:00:00.000Z',
    notes: '',
    status: 'active',
    ...overrides,
  };
}

const body = (fields: Partial<UpdateProjectBody> = {}) => fields as UpdateProjectBody;

describe('fields the request does not mention', () => {
  it('keeps every stored value when the body is empty', () => {
    const before = existing();
    const { patch } = buildProjectPatch(body(), before);

    expect(patch.name).toBe(before.name);
    expect(patch.totalFloorArea).toBe(before.totalFloorArea);
    expect(patch.safetyFactor).toBe(before.safetyFactor);
    expect(patch.status).toBe(before.status);
  });

  it('replaces only what the request supplies', () => {
    const { patch } = buildProjectPatch(body({ name: 'Renamed' }), existing());
    expect(patch.name).toBe('Renamed');
    expect(patch.clientName).toBe('Ayala Land');
  });

  it('truncates a fractional floor count rather than storing half a storey', () => {
    const { patch } = buildProjectPatch(
      body({ floorsAboveGrade: 8.7 as unknown as number }),
      existing(),
    );
    expect(patch.floorsAboveGrade).toBe(8);
  });
});

describe('wet bulb is derived, never accepted', () => {
  it('computes wet bulb from the resolved dry bulb and humidity', () => {
    const { patch } = buildProjectPatch(body({ outdoorDB: 35, outdoorRH: 60 }), existing());
    // Below dry bulb and above dew point — the physical bracket. Pinning the
    // exact figure would test the psychrometric routine, which has its own.
    expect(patch.outdoorWB).toBeLessThan(35);
    expect(patch.outdoorWB).toBeGreaterThan(20);
  });

  it('recomputes wet bulb when only humidity moves', () => {
    const dry = buildProjectPatch(body({ outdoorRH: 30 }), existing()).patch.outdoorWB;
    const humid = buildProjectPatch(body({ outdoorRH: 90 }), existing()).patch.outdoorWB;
    expect(humid).toBeGreaterThan(dry);
  });

  it('rounds to two decimals, so a stored figure is not spuriously precise', () => {
    const { patch } = buildProjectPatch(body({ outdoorDB: 33, outdoorRH: 67 }), existing());
    expect(patch.outdoorWB).toBe(Math.round(patch.outdoorWB * 100) / 100);
  });
});

describe('clearing an override versus leaving it alone', () => {
  it('treats null as a deliberate clear', () => {
    // The estimator removed their override; the suggested rate takes over.
    const { patch } = buildProjectPatch(
      body({ laborMultiplierOverride: null }),
      existing({ laborMultiplierOverride: 0.5 }),
    );
    expect(patch.laborMultiplierOverride).toBeNull();
  });

  it('treats an absent field as "leave the override standing"', () => {
    const { patch } = buildProjectPatch(body({}), existing({ laborMultiplierOverride: 0.5 }));
    expect(patch.laborMultiplierOverride).toBe(0.5);
  });

  it('accepts a zero override rather than reading it as absent', () => {
    // Zero overhead is a real commercial decision, not a missing value.
    const { patch } = buildProjectPatch(
      body({ overheadPercentOverride: 0 }),
      existing({ overheadPercentOverride: 0.2 }),
    );
    expect(patch.overheadPercentOverride).toBe(0);
  });

  it('falls back rather than storing a non-finite override', () => {
    expect(toNullableNumber(Number.NaN, 0.3)).toBe(0.3);
    expect(toNullableNumber('not a number', 0.3)).toBe(0.3);
  });

  it('distinguishes all three cases in one helper', () => {
    expect(toNullableNumber(null, 0.3)).toBeNull();
    expect(toNullableNumber(undefined, 0.3)).toBe(0.3);
    expect(toNullableNumber(0.7, 0.3)).toBe(0.7);
  });
});

describe('a rate change invalidates the stored bill', () => {
  it('marks the bill stale when a suggested rate moves', () => {
    const { patch, pricingChanged } = buildProjectPatch(
      body({ suggestedVatRate: 0.14 }),
      existing(),
    );
    expect(pricingChanged).toBe(true);
    expect(patch.isBoqStale).toBe(true);
  });

  it('marks the bill stale when an override is added', () => {
    const { pricingChanged } = buildProjectPatch(
      body({ laborMultiplierOverride: 0.5 }),
      existing(),
    );
    expect(pricingChanged).toBe(true);
  });

  it('marks the bill stale when an override is cleared', () => {
    // Clearing changes the effective rate just as surely as setting one.
    const { pricingChanged } = buildProjectPatch(
      body({ overheadPercentOverride: null }),
      existing({ overheadPercentOverride: 0.2 }),
    );
    expect(pricingChanged).toBe(true);
  });

  it('clears the generation timestamp along with the flag', () => {
    // The UI dates the bill from this field; leaving it would date a bill that
    // has just been invalidated.
    const { patch } = buildProjectPatch(body({ suggestedVatRate: 0.14 }), existing());
    expect(patch.lastBoqGeneratedAt).toBeNull();
  });

  it('leaves a valid bill alone when the edit form echoes rates back unchanged', () => {
    // The edit form submits the whole project. Treating "mentioned" as
    // "changed" would invalidate a correct bill on every unrelated save.
    const before = existing();
    const { pricingChanged, patch } = buildProjectPatch(
      body({
        name: 'Renamed',
        suggestedLaborMultiplier: before.suggestedLaborMultiplier,
        suggestedOverheadPercent: before.suggestedOverheadPercent,
        suggestedContingencyPercent: before.suggestedContingencyPercent,
        suggestedVatRate: before.suggestedVatRate,
      }),
      before,
    );

    expect(pricingChanged).toBe(false);
    expect(patch.isBoqStale).toBe(false);
    expect(patch.lastBoqGeneratedAt).toBe(before.lastBoqGeneratedAt);
  });

  it('does not un-stale a bill that was already stale', () => {
    // Regenerating is what clears the flag, not editing an unrelated field.
    const { patch } = buildProjectPatch(body({ name: 'Renamed' }), existing({ isBoqStale: true }));
    expect(patch.isBoqStale).toBe(true);
  });

  it('does not invalidate the bill for a non-pricing edit', () => {
    const { pricingChanged } = buildProjectPatch(
      body({ name: 'Renamed', notes: 'site visit booked' }),
      existing(),
    );
    expect(pricingChanged).toBe(false);
  });
});
