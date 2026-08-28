import { describe, it, expect } from 'vitest';
import {
  calculateEquipmentSelection as calcRaw,
  defaultEquipmentSelectionInputs,
  defaultEquipmentSelectionOverrides,
  type EquipmentSelectionInputs,
} from '@/lib/engine/hvac/equipment-selection-engine';

const inputs = (over: Partial<EquipmentSelectionInputs> = {}): EquipmentSelectionInputs => ({
  ...defaultEquipmentSelectionInputs,
  ...over,
});

const calculateEquipmentSelection = (i: EquipmentSelectionInputs) =>
  calcRaw(i, defaultEquipmentSelectionOverrides);

describe('calculateEquipmentSelection — invariants', () => {
  it('every candidate covers the required load and reports sane utilization', () => {
    const res = calculateEquipmentSelection(inputs({ requiredTr: 10 }));
    expect(res.candidates.length).toBeGreaterThan(0);
    for (const c of res.candidates) {
      // provided capacity must meet or exceed demand
      expect(c.providedTr).toBeGreaterThanOrEqual(10 - 1e-6);
      // utilization is a real percentage in (0, 100]
      expect(c.utilizationPct).toBeGreaterThan(0);
      expect(c.utilizationPct).toBeLessThanOrEqual(100 + 1e-6);
      expect(c.quantity).toBeGreaterThanOrEqual(1);
      expect(c.capexPhp).toBeGreaterThan(0);
      // lifecycle cost is capex plus (non-negative) energy over time
      expect(c.totalLifecyclePhp).toBeGreaterThanOrEqual(c.capexPhp - 1e-6);
    }
  });

  it('utilization equals requiredTr / providedTr', () => {
    const req = 7.5;
    const res = calculateEquipmentSelection(inputs({ requiredTr: req }));
    for (const c of res.candidates) {
      expect(c.utilizationPct).toBeCloseTo((req / c.providedTr) * 100, 4);
    }
  });

  it('is monotonic: a larger load never selects a smaller top-candidate capacity', () => {
    const small = calculateEquipmentSelection(inputs({ requiredTr: 5 }));
    const large = calculateEquipmentSelection(inputs({ requiredTr: 20 }));
    const topProvided = (r: ReturnType<typeof calculateEquipmentSelection>) =>
      r.candidates.find((c) => c.id === r.selectedCandidateId)?.providedTr
      ?? r.candidates[0]?.providedTr
      ?? 0;
    expect(topProvided(large)).toBeGreaterThanOrEqual(topProvided(small));
  });

  it('N+1 redundancy never provides less capacity than without it', () => {
    const base = calculateEquipmentSelection(inputs({ requiredTr: 12, redundancyNPlusOne: false }));
    const redundant = calculateEquipmentSelection(inputs({ requiredTr: 12, redundancyNPlusOne: true }));
    const cap = (r: ReturnType<typeof calculateEquipmentSelection>) =>
      Math.max(0, ...r.candidates.map((c) => c.providedTr));
    expect(cap(redundant)).toBeGreaterThanOrEqual(cap(base));
  });

  it('bounds the candidate shortlist and keeps quantity within the explored range', () => {
    const res = calculateEquipmentSelection(inputs({ requiredTr: 18, maxUnits: 4 }));
    expect(res.candidates.length).toBeLessThanOrEqual(12); // max_candidates
    // quantity never below the minimum needed to cover the load
    for (const c of res.candidates) {
      expect(c.quantity).toBeGreaterThanOrEqual(1);
      expect(c.providedTr).toBeGreaterThanOrEqual(18 - 1e-6);
    }
  });

  it('higher electricity rate raises annual energy cost for the same load', () => {
    const cheap = calculateEquipmentSelection(inputs({ requiredTr: 10, electricityRatePhpKwh: 6 }));
    const dear = calculateEquipmentSelection(inputs({ requiredTr: 10, electricityRatePhpKwh: 18 }));
    const firstCost = (r: ReturnType<typeof calculateEquipmentSelection>) => r.candidates[0]?.annualEnergyCostPhp ?? 0;
    expect(firstCost(dear)).toBeGreaterThan(firstCost(cheap));
  });

  it('produces a formula trace and is deterministic', () => {
    const a = calculateEquipmentSelection(inputs({ requiredTr: 9 }));
    const b = calculateEquipmentSelection(inputs({ requiredTr: 9 }));
    expect(a.formulas.length).toBeGreaterThan(0);
    expect(a.candidates.map((c) => c.id)).toEqual(b.candidates.map((c) => c.id));
  });
});
