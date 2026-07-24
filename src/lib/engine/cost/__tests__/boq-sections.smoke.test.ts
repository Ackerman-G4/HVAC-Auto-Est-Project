/**
 * smoke-boq-sections (plan §10) — asserts the 11-section BOQ (A–K) is present
 * and that section/line totals reconcile with the summary.
 *
 * Run: npm run validate:boq:sections
 */

import { describe, it, expect } from 'vitest';
import { compileBOQ, estimateDiffusersFromDucts, type CostInputs } from '@/lib/functions/cost-engine';
import type { DuctSizingResult } from '@/lib/functions/duct-sizing';
import type { ElectricalResult } from '@/lib/functions/electrical';
import type { RefrigerantPipeResult, CondensatePipeResult } from '@/lib/functions/pipe-sizing';

const duct: DuctSizingResult = {
  roundDiameter: 12,
  rectWidth: 14,
  rectHeight: 8,
  velocity: 900,
  frictionLoss: 0.08,
  areaRequired: 112,
  equivalentDiameter: 12,
  materialGauge: '26ga',
  insulationType: 'Armaflex',
  insulationThickness: 1,
};

const electrical: ElectricalResult = {
  fla: 20, mca: 25, mopd: 30, wireSize: '5.5mm²', wireSizeAWG: '10AWG',
  wireType: 'THHN', groundWire: '3.5mm²', conduitSize: '20mm',
  breakerSize: 30, breakerPoles: 3, voltageDropPercent: 1.8, notes: [],
};

const refrigerant: RefrigerantPipeResult = {
  liquidLine: { diameter: '3/8"', odMM: 9.52, insulationMM: 9 },
  suctionLine: { diameter: '5/8"', odMM: 15.88, insulationMM: 13 },
  maxLineLength: 50, actualLineLength: 20, refrigerantCharge: 400,
  braze: { joints: 8, rodKg: 0.3 }, insulationType: 'Armaflex', notes: [],
};

const condensate: CondensatePipeResult = {
  pipeDiameter: '32 mm', material: 'PVC', slopePercent: 1, trapRequired: true,
};

function fullInputs(): CostInputs {
  const ducts = [{ result: duct, runLengthM: 12 }];
  return {
    equipment: [{
      brand: 'Daikin', model: 'FDMF', type: 'ducted-split',
      quantity: 2, unitPriceMin: 180000, unitPriceMax: 220000, capacityTR: 5,
    }],
    refrigerantPipes: [{ result: refrigerant, runLengthM: 20 }],
    ducts,
    electrical: [electrical],
    diffusers: estimateDiffusersFromDucts(ducts, 'office'),
    condensate: [{ result: condensate, runLengthM: 8 }],
    controls: { zones: 4, co2Sensors: 2, bmsPoints: 12 },
  };
}

describe('smoke: 11-section BOQ (A–K)', () => {
  const boq = compileBOQ(fullInputs());
  const sections = new Set(boq.items.map((i) => i.section.charAt(0)));

  it('has all 11 canonical sections present', () => {
    for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']) {
      expect(sections.has(letter), `missing section ${letter}`).toBe(true);
    }
    expect(sections.size).toBe(11);
  });

  it('includes the v2.0 new sections with real line items', () => {
    const bySection = (prefix: string) => boq.items.filter((i) => i.section.startsWith(prefix));
    expect(bySection('E - Diffusers').length).toBeGreaterThan(0);
    expect(bySection('G - Controls').length).toBe(3); // thermostat + CO2 + BMS
    expect(bySection('I - Labor').length).toBeGreaterThan(1); // itemized by trade
    expect(bySection('J - Professional Fees').length).toBe(1);
    expect(bySection('K - Permits').length).toBe(1);
  });

  it('reconciles item categories to summary component costs', () => {
    const sum = (cat: string) =>
      boq.items.filter((i) => i.category === cat).reduce((s, i) => s + i.totalPrice, 0);

    expect(Math.round(sum('equipment'))).toBe(boq.equipmentCost);
    expect(Math.round(sum('material'))).toBe(boq.materialCost);
    // laborCost summary == all 'labor' line items (equipment install + trade labor)
    expect(Math.round(sum('labor'))).toBe(boq.laborCost);
  });

  it('reconciles the grand total end to end', () => {
    const feeTotal = boq.items
      .filter((i) => i.category === 'fee')
      .reduce((s, i) => s + i.totalPrice, 0);
    const beforeVAT = boq.subtotal + feeTotal + boq.overhead + boq.contingency;
    // allow ±2 PHP for independent rounding of each component
    expect(Math.abs(boq.grandTotal - (beforeVAT + boq.vat))).toBeLessThanOrEqual(2);
    expect(boq.grandTotal).toBeGreaterThan(boq.subtotal);
  });
});
