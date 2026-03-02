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

  /** Installation labor multiplier (default 0.35 = 35% of material cost) */
  laborMultiplier?: number;

  /** Overhead & profit percentage (default 0.15 = 15%) */
  overheadPercent?: number;

  /** VAT rate (default 0.12 = 12%) */
  vatRate?: number;

  /** Include contingency (default 0.05 = 5%) */
  contingencyPercent?: number;
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

  // ── SECTION E: Condensate Drain ───────────────────────────
  if (inputs.condensate) {
    for (const drain of inputs.condensate) {
      const pvcPrice = getMaterialPrice('pvc_pipe', drain.result.pipeDiameter.split(' ')[0], 180);
      items.push({
        id: `BOQ-${String(itemId++).padStart(3, '0')}`,
        section: 'E - Drainage',
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
        section: 'E - Drainage',
        description: 'PVC fittings (elbow, tee, trap) - lot',
        quantity: 1,
        unit: 'lot',
        unitPrice: 500,
        totalPrice: 500,
        category: 'material',
      });
    }
  }

  // ── SECTION F: Miscellaneous ──────────────────────────────
  // Consumables
  items.push({
    id: `BOQ-${String(itemId++).padStart(3, '0')}`,
    section: 'F - Miscellaneous',
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

  // Additional labor for all materials
  const additionalLabor = materialCost * laborMultiplier;
  items.push({
    id: `BOQ-${String(itemId++).padStart(3, '0')}`,
    section: 'G - Labor',
    description: 'Installation labor (piping, ductwork, electrical, drainage)',
    quantity: 1,
    unit: 'lot',
    unitPrice: additionalLabor,
    totalPrice: additionalLabor,
    category: 'labor',
  });

  const totalLabor = laborCost + additionalLabor;
  const subtotal = equipmentCost + materialCost + totalLabor;
  const overhead = subtotal * overheadPercent;
  const contingency = subtotal * contingencyPercent;
  const beforeVAT = subtotal + overhead + contingency;
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
