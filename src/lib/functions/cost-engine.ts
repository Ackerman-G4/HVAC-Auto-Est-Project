/**
 * Cost Engine / BOQ Compiler
 * Compiles Bill of Quantities with Philippine Peso pricing
 */

import { MATERIAL_DEFAULTS, type MaterialDefault } from '@/constants/material-defaults';
import type { BOQItem, BOQSummary, CostAlert } from '@/types/material';
import type { RefrigerantPipeResult } from './pipe-sizing';
import type { DuctSizingResult } from './duct-sizing';
import type { ElectricalResult } from './electrical';
import type { CondensatePipeResult } from './pipe-sizing';

export interface CostInputs {
  /** Equipment selections */
  equipment: {
    brand: string;
    model: string;
    type: string;
    quantity: number;
    unitPriceMin: number;
    unitPriceMax: number;
    capacityTR: number;
  }[];

  /** Refrigerant pipe results per unit */
  refrigerantPipes?: {
    result: RefrigerantPipeResult;
    runLengthM: number;
  }[];

  /** Duct sizing results */
  ducts?: {
    result: DuctSizingResult;
    runLengthM: number;
  }[];

  /** Electrical results */
  electrical?: ElectricalResult[];

  /** Condensate drain */
  condensate?: {
    result: CondensatePipeResult;
    runLengthM: number;
  }[];

  /** Diffusers & grilles (BOQ Section E, plan §7). */
  diffusers?: DiffuserInput[];

  /** Controls: thermostats, CO₂ sensors, BMS points (BOQ Section G, plan §7). */
  controls?: ControlsInput;

  /** Installation labor multiplier (default 0.35 = 35% of material cost) */
  laborMultiplier?: number;

  /**
   * Optional per-trade labor multipliers (plan §7 "labor by trade instead of
   * flat 35%"). Keys are trade section names ('B - Refrigerant Piping', etc.).
   * When omitted for a trade, {@link laborMultiplier} is used. Labor is still
   * itemized per trade regardless (Section I).
   */
  laborRatesByTrade?: Record<string, number>;

  /** Engineering / professional fee, fraction of subtotal (BOQ Section J). */
  engineeringFeePercent?: number;

  /** Permit & compliance fee, fraction of subtotal (BOQ Section K). */
  permitFeePercent?: number;

  /** Overhead & profit percentage (default 0.15 = 15%) */
  overheadPercent?: number;

  /** VAT rate (default 0.12 = 12%) */
  vatRate?: number;

  /** Include contingency (default 0.05 = 5%) */
  contingencyPercent?: number;
}

/** One diffuser / grille line for BOQ Section E. */
export interface DiffuserInput {
  /** Space type this device serves (drives default selection). */
  spaceType?: string;
  /** Device kind. */
  kind?: 'supply_diffuser' | 'return_grille' | 'exhaust_grille';
  /** Nominal size label, e.g. "600x600". */
  sizeLabel?: string;
  quantity: number;
  /** Override unit price (PHP); else catalog/default is used. */
  unitPrice?: number;
}

/** Controls & BMS quantities for BOQ Section G. */
export interface ControlsInput {
  /** Number of control zones → one thermostat each. */
  zones?: number;
  /** CO₂ sensors (per ASHRAE 62.1 occupancy category). */
  co2Sensors?: number;
  /** BMS monitoring/control points. */
  bmsPoints?: number;
  thermostatUnitPrice?: number;
  co2SensorUnitPrice?: number;
  bmsPointUnitPrice?: number;
}

const DEFAULT_ENGINEERING_FEE_PERCENT = 0.05;
const DEFAULT_PERMIT_FEE_PERCENT = 0.02;

/** Trades that carry installation labor, itemized in Section I. */
const LABOR_TRADES: readonly string[] = [
  'B - Refrigerant Piping',
  'C - Ductwork',
  'D - Electrical',
  'E - Diffusers & Grilles',
  'F - Drainage',
  'G - Controls',
  'H - Miscellaneous',
];

/**
 * Estimate diffuser/grille quantities from computed duct runs (plan §7:
 * "Quantity from duct layout output"). One supply diffuser per duct run plus a
 * return grille per two runs is a defensible first-order rule; callers with a
 * real terminal layout should pass explicit {@link DiffuserInput}s instead.
 */
export function estimateDiffusersFromDucts(
  ducts: NonNullable<CostInputs['ducts']>,
  spaceType?: string,
): DiffuserInput[] {
  const runCount = ducts.length;
  if (runCount <= 0) return [];
  return [
    { spaceType, kind: 'supply_diffuser', sizeLabel: '600x600', quantity: runCount },
    { spaceType, kind: 'return_grille', sizeLabel: '600x600', quantity: Math.max(1, Math.ceil(runCount / 2)) },
  ];
}

/** Find material from defaults catalog */
function findMaterial(category: string, partialName: string): MaterialDefault | undefined {
  return MATERIAL_DEFAULTS.find(
    (m: { category: string; name: string; }) => m.category === category && m.name.toLowerCase().includes(partialName.toLowerCase())
  );
}

/** Get material price or default */
function getMaterialPrice(category: string, partialName: string, fallback: number): number {
  const mat = findMaterial(category, partialName);
  return mat ? mat.unitPricePHP : fallback;
}

/**
 * Generate BOQ items from cost inputs
 */
export function compileBOQ(inputs: CostInputs): BOQSummary {
  const items: BOQItem[] = [];
  let itemId = 1;
  const laborMultiplier = inputs.laborMultiplier ?? 0.35;
  const overheadPercent = inputs.overheadPercent ?? 0.15;
  const vatRate = inputs.vatRate ?? 0.12;
  const contingencyPercent = inputs.contingencyPercent ?? 0.05;
  const engineeringFeePercent = inputs.engineeringFeePercent ?? DEFAULT_ENGINEERING_FEE_PERCENT;
  const permitFeePercent = inputs.permitFeePercent ?? DEFAULT_PERMIT_FEE_PERCENT;

  // ── SECTION A: Equipment ──────────────────────────────────
  for (const eq of inputs.equipment) {
    const avgPrice = (eq.unitPriceMin + eq.unitPriceMax) / 2;
    items.push({
      id: `BOQ-${String(itemId++).padStart(3, '0')}`,
      section: 'A - Equipment',
      description: `${eq.brand} ${eq.model} (${eq.type}) - ${eq.capacityTR} TR`,
      quantity: eq.quantity,
      unit: 'unit',
      unitPrice: avgPrice,
      totalPrice: avgPrice * eq.quantity,
      category: 'equipment',
    });

    // Installation per unit
    items.push({
      id: `BOQ-${String(itemId++).padStart(3, '0')}`,
      section: 'A - Equipment',
      description: `Installation of ${eq.brand} ${eq.model}`,
      quantity: eq.quantity,
      unit: 'unit',
      unitPrice: avgPrice * 0.15, // 15% of equipment cost
      totalPrice: avgPrice * 0.15 * eq.quantity,
      category: 'labor',
    });
  }

  // ── SECTION B: Refrigerant Piping ─────────────────────────
  if (inputs.refrigerantPipes) {
    for (const pipe of inputs.refrigerantPipes) {
      const { result, runLengthM } = pipe;

      // Liquid line copper
      const liquidPricePerM = getMaterialPrice('copper_pipe', result.liquidLine.diameter.replace('"', ''), 350);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'B - Refrigerant Piping',
        description: `Copper tube ${result.liquidLine.diameter} (liquid line)`,
        quantity: Math.ceil(runLengthM),
        unit: 'meter',
        unitPrice: liquidPricePerM,
        totalPrice: liquidPricePerM * Math.ceil(runLengthM),
        category: 'material',
      });

      // Suction line copper
      const suctionPricePerM = getMaterialPrice('copper_pipe', result.suctionLine.diameter.replace('"', ''), 550);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'B - Refrigerant Piping',
        description: `Copper tube ${result.suctionLine.diameter} (suction line)`,
        quantity: Math.ceil(runLengthM),
        unit: 'meter',
        unitPrice: suctionPricePerM,
        totalPrice: suctionPricePerM * Math.ceil(runLengthM),
        category: 'material',
      });

      // Pipe insulation
      const insulationPrice = getMaterialPrice('insulation', 'Armaflex', 280);
      const totalInsulationM = runLengthM * 2; // both lines
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'B - Refrigerant Piping',
        description: `Armaflex insulation ${result.suctionLine.insulationMM}mm`,
        quantity: Math.ceil(totalInsulationM),
        unit: 'meter',
        unitPrice: insulationPrice,
        totalPrice: insulationPrice * Math.ceil(totalInsulationM),
        category: 'material',
      });

      // Brazing rods
      const brazingPrice = getMaterialPrice('brazing', 'Silver brazing', 120);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'B - Refrigerant Piping',
        description: 'Silver brazing rod (15% Ag)',
        quantity: Math.ceil(result.braze.rodKg * 10) / 10,
        unit: 'kg',
        unitPrice: brazingPrice * 10, // per kg
        totalPrice: brazingPrice * 10 * result.braze.rodKg,
        category: 'material',
      });
    }
  }

  // ── SECTION C: Ductwork ───────────────────────────────────
  if (inputs.ducts) {
    for (const duct of inputs.ducts) {
      const { result, runLengthM } = duct;
      const runLengthFt = runLengthM * 3.281;

      // GI Sheet
      const perimeter = 2 * (result.rectWidth + result.rectHeight) / 12; // feet
      const giSqFt = perimeter * runLengthFt;
      const giPrice = getMaterialPrice('gi_sheet', result.materialGauge, 45);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'C - Ductwork',
        description: `GI Sheet ${result.materialGauge} (${result.rectWidth}"×${result.rectHeight}" duct)`,
        quantity: Math.ceil(giSqFt),
        unit: 'sq ft',
        unitPrice: giPrice,
        totalPrice: giPrice * Math.ceil(giSqFt),
        category: 'material',
      });

      // Duct insulation
      if (result.insulationThickness > 0) {
        const ductInsulPrice = getMaterialPrice('insulation', 'Armaflex sheet', 350);
        items.push({
          id: `BOQ-${String(itemId++).padStart(3, '0')}`,
          section: 'C - Ductwork',
          description: `Duct insulation (Armaflex ${result.insulationThickness}" thick)`,
          quantity: Math.ceil(giSqFt),
          unit: 'sq ft',
          unitPrice: ductInsulPrice / 10, // convert to per sqft approx
          totalPrice: (ductInsulPrice / 10) * Math.ceil(giSqFt),
          category: 'material',
        });
      }

      // Duct accessories
      const elbowPrice = getMaterialPrice('duct_accessories', 'elbow', 450);
      const elbowCount = Math.ceil(runLengthM / 3);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'C - Ductwork',
        description: `GI Elbow ${result.rectWidth}"×${result.rectHeight}"`,
        quantity: elbowCount,
        unit: 'pc',
        unitPrice: elbowPrice,
        totalPrice: elbowPrice * elbowCount,
        category: 'material',
      });

      // Hangers
      const hangerPrice = getMaterialPrice('hangers_supports', 'Threaded rod', 85);
      const hangerCount = Math.ceil(runLengthM / 1.2);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'C - Ductwork',
        description: 'Duct hanger assembly (threaded rod + angle bar)',
        quantity: hangerCount,
        unit: 'set',
        unitPrice: hangerPrice * 2,
        totalPrice: hangerPrice * 2 * hangerCount,
        category: 'material',
      });
    }
  }

  // ── SECTION D: Electrical ─────────────────────────────────
  if (inputs.electrical) {
    for (const elec of inputs.electrical) {
      // Wire
      const wirePrice = getMaterialPrice('electrical', 'THHN', 85);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'D - Electrical',
        description: `THHN Wire ${elec.wireSize}`,
        quantity: 30, // default run estimate
        unit: 'meter',
        unitPrice: wirePrice,
        totalPrice: wirePrice * 30,
        category: 'material',
      });

      // Breaker
      const breakerPrice = elec.breakerSize <= 60 ? 850 : elec.breakerSize <= 100 ? 1500 : 2500;
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'D - Electrical',
        description: `Circuit Breaker ${elec.breakerSize}A ${elec.breakerPoles}P`,
        quantity: 1,
        unit: 'pc',
        unitPrice: breakerPrice,
        totalPrice: breakerPrice,
        category: 'material',
      });

      // Conduit
      const conduitPrice = getMaterialPrice('electrical', 'PVC conduit', 125);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'D - Electrical',
        description: `PVC Conduit ${elec.conduitSize}`,
        quantity: 30,
        unit: 'meter',
        unitPrice: conduitPrice,
        totalPrice: conduitPrice * 30,
        category: 'material',
      });
    }
  }

  // ── SECTION E: Diffusers & Grilles ────────────────────────
  if (inputs.diffusers) {
    for (const diff of inputs.diffusers) {
      if (diff.quantity <= 0) continue;
      const kind = diff.kind ?? 'supply_diffuser';
      const size = diff.sizeLabel ?? '600x600';
      const fallback = kind === 'supply_diffuser' ? 1800 : 1200;
      const unitPrice = diff.unitPrice ?? getMaterialPrice('diffuser', kind, fallback);
      const label =
        kind === 'supply_diffuser' ? 'Supply air diffuser'
          : kind === 'return_grille' ? 'Return air grille'
            : 'Exhaust grille';
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'E - Diffusers & Grilles',
        description: `${label} ${size}${diff.spaceType ? ` (${diff.spaceType})` : ''}`,
        quantity: diff.quantity,
        unit: 'pc',
        unitPrice,
        totalPrice: unitPrice * diff.quantity,
        category: 'material',
      });
    }
  }

  // ── SECTION F: Condensate Drain ───────────────────────────
  if (inputs.condensate) {
    for (const drain of inputs.condensate) {
      const pvcPrice = getMaterialPrice('pvc_pipe', drain.result.pipeDiameter.split(' ')[0], 180);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'F - Drainage',
        description: `PVC Pipe ${drain.result.pipeDiameter} (condensate drain)`,
        quantity: Math.ceil(drain.runLengthM),
        unit: 'meter',
        unitPrice: pvcPrice,
        totalPrice: pvcPrice * Math.ceil(drain.runLengthM),
        category: 'material',
      });

      // Fittings (elbow, tee, trap)
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'F - Drainage',
        description: 'PVC fittings (elbow, tee, trap) - lot',
        quantity: 1,
        unit: 'lot',
        unitPrice: 500,
        totalPrice: 500,
        category: 'material',
      });
    }
  }

  // ── SECTION G: Controls ───────────────────────────────────
  if (inputs.controls) {
    const c = inputs.controls;
    const zones = Math.max(0, Math.floor(c.zones ?? 0));
    const co2 = Math.max(0, Math.floor(c.co2Sensors ?? 0));
    const bms = Math.max(0, Math.floor(c.bmsPoints ?? 0));

    if (zones > 0) {
      const price = c.thermostatUnitPrice ?? getMaterialPrice('controls', 'thermostat', 2800);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'G - Controls',
        description: 'Programmable thermostat (one per zone)',
        quantity: zones,
        unit: 'pc',
        unitPrice: price,
        totalPrice: price * zones,
        category: 'material',
      });
    }
    if (co2 > 0) {
      const price = c.co2SensorUnitPrice ?? getMaterialPrice('controls', 'co2', 6500);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'G - Controls',
        description: 'CO₂ sensor (ASHRAE 62.1 demand-controlled ventilation)',
        quantity: co2,
        unit: 'pc',
        unitPrice: price,
        totalPrice: price * co2,
        category: 'material',
      });
    }
    if (bms > 0) {
      const price = c.bmsPointUnitPrice ?? getMaterialPrice('controls', 'bms', 3500);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'G - Controls',
        description: 'BMS monitoring/control point (wiring + I/O)',
        quantity: bms,
        unit: 'point',
        unitPrice: price,
        totalPrice: price * bms,
        category: 'material',
      });
    }
  }

  // ── SECTION H: Miscellaneous ──────────────────────────────
  // Consumables
  items.push({
    id: `BOQ-${String(itemId++).padStart(3, '0')}`,
    section: 'H - Miscellaneous',
    description: 'Sealant, tape, bolts, screws, consumables',
    quantity: 1,
    unit: 'lot',
    unitPrice: 5000,
    totalPrice: 5000,
    category: 'material',
  });

  // ── Calculate Summary ─────────────────────────────────────
  const equipmentCost = items
    .filter((i) => i.category === 'equipment')
    .reduce((sum, i) => sum + i.totalPrice, 0);

  const materialCost = items
    .filter((i) => i.category === 'material')
    .reduce((sum, i) => sum + i.totalPrice, 0);

  const laborCost = items
    .filter((i) => i.category === 'labor')
    .reduce((sum, i) => sum + i.totalPrice, 0);

  // ── SECTION I: Installation Labor (itemized by trade, plan §7) ────
  // Distribute installation labor across trades using per-trade material cost
  // and either a per-trade rate or the flat multiplier. Total still reconciles
  // to Σ(trade material × its rate).
  const materialByTrade = new Map<string, number>();
  for (const item of items) {
    if (item.category !== 'material') continue;
    materialByTrade.set(item.section, (materialByTrade.get(item.section) ?? 0) + item.totalPrice);
  }

  let additionalLabor = 0;
  for (const trade of LABOR_TRADES) {
    const tradeMaterial = materialByTrade.get(trade) ?? 0;
    if (tradeMaterial <= 0) continue;
    const rate = inputs.laborRatesByTrade?.[trade] ?? laborMultiplier;
    const tradeLabor = tradeMaterial * rate;
    if (tradeLabor <= 0) continue;
    additionalLabor += tradeLabor;
    const tradeName = trade.replace(/^[A-Z] - /, '');
    items.push({
      id: `BOQ-${String(itemId++).padStart(3, '0')}`,
      section: 'I - Labor',
      description: `Installation labor — ${tradeName} (${Math.round(rate * 100)}%)`,
      quantity: 1,
      unit: 'lot',
      unitPrice: Math.round(tradeLabor),
      totalPrice: Math.round(tradeLabor),
      category: 'labor',
    });
  }

  const totalLabor = laborCost + additionalLabor;
  const subtotal = equipmentCost + materialCost + totalLabor;

  // ── SECTION J: Professional / Engineering Fees ────────────
  const engineeringFee = subtotal * engineeringFeePercent;
  if (engineeringFee > 0) {
    items.push({
      id: `BOQ-${String(itemId++).padStart(3, '0')}`,
      section: 'J - Professional Fees',
      description: `Engineering & design fee (${Math.round(engineeringFeePercent * 100)}% of subtotal)`,
      quantity: 1,
      unit: 'lot',
      unitPrice: Math.round(engineeringFee),
      totalPrice: Math.round(engineeringFee),
      category: 'fee',
    });
  }

  // ── SECTION K: Permits & Compliance ───────────────────────
  const permitFee = subtotal * permitFeePercent;
  if (permitFee > 0) {
    items.push({
      id: `BOQ-${String(itemId++).padStart(3, '0')}`,
      section: 'K - Permits & Compliance',
      description: `Permit & compliance fees (${Math.round(permitFeePercent * 100)}% of subtotal)`,
      quantity: 1,
      unit: 'lot',
      unitPrice: Math.round(permitFee),
      totalPrice: Math.round(permitFee),
      category: 'fee',
    });
  }

  const overhead = subtotal * overheadPercent;
  const contingency = subtotal * contingencyPercent;
  const beforeVAT = subtotal + engineeringFee + permitFee + overhead + contingency;
  const vat = beforeVAT * vatRate;
  const grandTotal = beforeVAT + vat;

  // Cost alerts
  const alerts: CostAlert[] = [];
  
  if (materialCost > equipmentCost * 0.5) {
    alerts.push({
      type: 'warning',
      message: 'Material cost is unusually high relative to equipment cost. Review specifications.',
    });
  }

  if (totalLabor > equipmentCost * 0.4) {
    alerts.push({
      type: 'info',
      message: 'Labor costs are above typical range. Complex installation expected.',
    });
  }

  const costPerTR = inputs.equipment.length > 0
    ? grandTotal / inputs.equipment.reduce((sum, eq) => sum + eq.capacityTR * eq.quantity, 0)
    : 0;

  if (costPerTR > 120000) {
    alerts.push({
      type: 'warning',
      message: `Cost per TR (₱${Math.round(costPerTR).toLocaleString()}) exceeds typical Philippine market range.`,
    });
  }

  return {
    items,
    equipmentCost: Math.round(equipmentCost),
    materialCost: Math.round(materialCost),
    laborCost: Math.round(totalLabor),
    overhead: Math.round(overhead),
    contingency: Math.round(contingency),
    subtotal: Math.round(subtotal),
    vat: Math.round(vat),
    grandTotal: Math.round(grandTotal),
    costPerTR: Math.round(costPerTR),
    alerts,
    generatedAt: new Date().toISOString(),
  };
}
