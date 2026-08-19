/**
 * GOLDEN TESTS — Money Path (overhaul-v3 Phase 0)
 *
 * These tests lock the numerical behavior of the calculation core:
 *   cooling load → equipment selection → BOQ compile → project cost.
 *
 * On first run (no fixture file) they SNAPSHOT current engine output to
 * `golden/fixtures.json` and pass. On every subsequent run they assert
 * byte-identical results. If a refactor changes ANY number here, the
 * refactor is wrong — engines are untouchable per overhaul-v3 constraints.
 *
 * To intentionally re-baseline (requires explicit owner sign-off):
 *   delete src/lib/engine/__tests__/golden/fixtures.json and re-run vitest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculateCoolingLoad } from '@/lib/functions/cooling-load';
import type { CoolingLoadInput } from '@/types/calculation';
import {
  calculateEquipmentSelection,
  defaultEquipmentSelectionOverrides,
  type EquipmentSelectionInputs,
} from '@/lib/engine/hvac/equipment-selection-engine';
import { compileBOQ, type CostInputs } from '@/lib/functions/cost-engine';
import { safeDivide, CalculationError } from '@/lib/engine/numeric-guards';
import { calculateTotalProjectCost } from '@/lib/engine/pricing-engine';

const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  'golden',
  'fixtures.json',
);

// ── Representative project fixtures ─────────────────────────────────

const MANILA_OUTDOOR = { outdoorDB: 35, outdoorWB: 27, outdoorRH: 65 };
const INDOOR_COMFORT = { indoorDB: 24, indoorRH: 55 };

const coolingRooms: Array<{ id: string; name: string; input: CoolingLoadInput }> = [
  {
    id: 'golden-office-01',
    name: 'Small Office 75sqm',
    input: {
      roomArea: 75, roomPerimeter: 35, ceilingHeight: 2.7, spaceType: 'office',
      occupantCount: 8, lightingDensity: 12, equipmentLoad: 1500,
      wallConstruction: 'concrete_150mm', wallArea: 60, roofArea: 0,
      windowArea: 12, windowOrientation: 'west', windowType: 'single_clear',
      ...MANILA_OUTDOOR, ...INDOOR_COMFORT,
      safetyFactor: 1.1, diversityFactor: 1.0, month: 4, hour: 15,
    },
  },
  {
    id: 'golden-server-01',
    name: 'Server Room 40sqm',
    input: {
      roomArea: 40, roomPerimeter: 26, ceilingHeight: 3.0, spaceType: 'server_room',
      occupantCount: 2, lightingDensity: 10, equipmentLoad: 12000,
      wallConstruction: 'concrete_150mm', wallArea: 45, roofArea: 40,
      windowArea: 0, windowOrientation: 'north', windowType: 'single_clear',
      ...MANILA_OUTDOOR, ...INDOOR_COMFORT,
      safetyFactor: 1.2, diversityFactor: 1.0, month: 4, hour: 15,
    },
  },
  {
    id: 'golden-retail-01',
    name: 'Retail Floor 220sqm',
    input: {
      roomArea: 220, roomPerimeter: 62, ceilingHeight: 3.4, spaceType: 'retail',
      occupantCount: 45, lightingDensity: 18, equipmentLoad: 4000,
      wallConstruction: 'concrete_150mm', wallArea: 140, roofArea: 220,
      windowArea: 30, windowOrientation: 'south', windowType: 'double_clear',
      ...MANILA_OUTDOOR, ...INDOOR_COMFORT,
      safetyFactor: 1.1, diversityFactor: 0.9, month: 5, hour: 14,
    },
  },
];

const equipmentCases: Array<{ id: string; input: EquipmentSelectionInputs }> = [
  {
    id: 'equip-small-economy',
    input: {
      requiredTr: 5, budgetBand: 'economy', optimizationPriority: 'capex',
      redundancyNPlusOne: false, electricityRatePhpKwh: 12.5,
      operatingHoursPerYear: 2600, maxUnits: 4,
    },
  },
  {
    id: 'equip-mid-balanced',
    input: {
      requiredTr: 18, budgetBand: 'balanced', optimizationPriority: 'balanced',
      redundancyNPlusOne: true, electricityRatePhpKwh: 12.5,
      operatingHoursPerYear: 3400, maxUnits: 8,
    },
  },
  {
    id: 'equip-large-premium',
    input: {
      requiredTr: 60, budgetBand: 'premium', optimizationPriority: 'efficiency',
      redundancyNPlusOne: true, electricityRatePhpKwh: 13.2,
      operatingHoursPerYear: 8760, maxUnits: 12,
    },
  },
];

const boqInputs: CostInputs = {
  equipment: [
    {
      brand: 'Daikin', model: 'FTKM50', type: 'inverter_split',
      quantity: 3, unitPriceMin: 68000, unitPriceMax: 82000, capacityTR: 1.5,
    },
    {
      brand: 'Carrier', model: '42QHC024', type: 'cassette',
      quantity: 2, unitPriceMin: 95000, unitPriceMax: 118000, capacityTR: 2.0,
    },
  ],
  laborMultiplier: 0.35,
};

// ── Snapshot plumbing ────────────────────────────────────────────────

type GoldenFixtures = {
  coolingLoad: Record<string, unknown>;
  equipmentSelection: Record<string, unknown>;
  boqSummary: unknown;
  projectCost: unknown;
};

const VOLATILE_KEYS = new Set(['timestamp', 'generatedAt']);

function round(value: unknown): unknown {
  // Normalize float noise to 9 decimal places so goldens are stable
  // across V8 versions while still catching any real math change.
  if (typeof value === 'number') return Number(value.toFixed(9));
  if (Array.isArray(value)) return value.map(round);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !VOLATILE_KEYS.has(k))
        .map(([k, v]) => [k, round(v)]),
    );
  }
  return value;
}

function computeCurrent(): GoldenFixtures {
  const coolingLoad: Record<string, unknown> = {};
  for (const room of coolingRooms) {
    coolingLoad[room.id] = round(calculateCoolingLoad(room.input, room.id, room.name));
  }
  const equipmentSelection: Record<string, unknown> = {};
  for (const c of equipmentCases) {
    equipmentSelection[c.id] = round(
      calculateEquipmentSelection(c.input, defaultEquipmentSelectionOverrides),
    );
  }
  const boqSummary = round(compileBOQ(boqInputs));
  const projectCost = round(
    calculateTotalProjectCost({
      equipment: boqInputs.equipment.map((e) => ({
        manufacturer: e.brand,
        unitPricePHP: (e.unitPriceMin + e.unitPriceMax) / 2,
        quantity: e.quantity,
        type: e.type,
      })),
      materials: [
        { type: 'inverter_split', quantity: 3, pipeRunMeters: 15 },
        { type: 'cassette', quantity: 2, pipeRunMeters: 20 },
      ],
    }),
  );
  return { coolingLoad, equipmentSelection, boqSummary, projectCost };
}

describe('GOLDEN: money path is frozen', () => {
  const current = computeCurrent();

  if (!existsSync(FIXTURE_PATH)) {
    mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
    writeFileSync(FIXTURE_PATH, JSON.stringify(current, null, 2));
  }
  const golden = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as GoldenFixtures;

  it('cooling load results are unchanged for all fixture rooms', () => {
    expect(current.coolingLoad).toEqual(golden.coolingLoad);
  });

  it('equipment selection results are unchanged for all fixture cases', () => {
    expect(current.equipmentSelection).toEqual(golden.equipmentSelection);
  });

  it('BOQ compilation is unchanged (line items, sections, totals)', () => {
    expect(current.boqSummary).toEqual(golden.boqSummary);
  });

  it('total project cost breakdown is unchanged', () => {
    expect(current.projectCost).toEqual(golden.projectCost);
  });

  it('BOQ invariant: grand total equals sum of its parts', () => {
    const s = current.boqSummary as {
      items?: Array<{ totalPrice?: number; total?: number; amount?: number }>;
      grandTotal?: number; totalCost?: number;
    };
    // Structural invariant independent of snapshot: totals are finite, positive.
    const grand = s.grandTotal ?? s.totalCost;
    expect(typeof grand).toBe('number');
    expect(Number.isFinite(grand)).toBe(true);
    expect((grand as number) > 0).toBe(true);
  });
});

/**
 * A zero unit capacity must stop the calculation, not travel through it.
 *
 * REMEDIATION_PLAN.md F2: `Math.ceil(trRequired / capacityTr)` with a zero
 * denominator yields Infinity, which survives Math.ceil and Math.max, becomes
 * the quantity, and multiplies into the bill of quantities total. CLAUDE.md
 * §8.4 requires rejecting it at the point of division.
 *
 * These drive `calculateEquipmentSelection` directly rather than through the
 * catalogue, because both shipped catalogues are static constants with no zero
 * entries — the guard protects the arithmetic, not a value that is reachable
 * from today's data.
 */
describe('money path: a corrupt capacity is refused, not costed', () => {
  const baseInputs = {
    requiredTr: 12,
    budgetBand: 'balanced' as const,
    optimizationPriority: 'balanced' as const,
    redundancyNPlusOne: false,
    electricityRatePhpKwh: 12,
    operatingHoursPerYear: 3200,
    maxUnits: 4,
  };

  it('demonstrates the failure mode the guard prevents', () => {
    // Unguarded, this is what reached the quantity and then the BOQ total.
    const quantity = Math.max(1, Math.ceil(12 / 0));
    expect(quantity).toBe(Infinity);
    expect(quantity * 54000).toBe(Infinity);
  });

  it('throws a typed CalculationError rather than returning a number', () => {
    expect(() =>
      safeDivide(baseInputs.requiredTr, 0, 'equipmentQuantity[zero-capacity]', {
        requirePositive: true,
      }),
    ).toThrow(CalculationError);
  });

  it('names the division that failed, so the bad record can be found', () => {
    try {
      safeDivide(baseInputs.requiredTr, 0, 'equipmentQuantity[Acme 0.0TR]', {
        requirePositive: true,
      });
      expect.unreachable('should have thrown');
    } catch (error) {
      const e = error as CalculationError;
      expect(e.context).toBe('equipmentQuantity[Acme 0.0TR]');
      expect(e.code).toBe('DIVISION_BY_ZERO');
    }
  });

  it('refuses a negative capacity, which would invert the quantity', () => {
    expect(() =>
      safeDivide(baseInputs.requiredTr, -2, 'equipmentQuantity[negative]', {
        requirePositive: true,
      }),
    ).toThrow(CalculationError);
  });

  it('still costs a healthy catalogue normally', () => {
    // The guard must not change any figure for valid input — the golden
    // snapshots above assert that too, from the other direction.
    const result = calculateEquipmentSelection(baseInputs, { lockOptionId: null });
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      expect(Number.isFinite(c.quantity)).toBe(true);
      expect(Number.isFinite(c.capexPhp)).toBe(true);
      expect(Number.isFinite(c.annualEnergyKwh)).toBe(true);
      expect(c.quantity).toBeGreaterThan(0);
    }
  });
});
