// HVAC Pricing Engine
// Calculates equipment, material, labor, and total project costs

import {
  BRAND_TIERS,
  TIER_MULTIPLIERS,
  MATERIAL_PRICES,
  DEFAULT_PIPE_RUNS,
  LABOR_RATES,
  PROJECT_OVERHEAD,
  type BrandTier,
} from '@/constants/pricing-engine';
import { getRuleSetSync } from '@/lib/engine/rules';
import { constantFromRuleSet, lookupFromRuleSet } from '@/lib/engine/rules/rule-evaluator';

// ─── Rules-driven constants ─────────────────────────────────────────

function getPricingConstant(name: string, fallback: number): number {
  try {
    return constantFromRuleSet(getRuleSetSync('pricing'), 'pricing_constants', name);
  } catch { return fallback; }
}

function getRuleTierMultiplier(brand: string): number | null {
  try {
    return lookupFromRuleSet(getRuleSetSync('pricing'), 'brand_tier_multipliers', brand);
  } catch { return null; }
}

export interface EquipmentCostInput {
  manufacturer: string;
  unitPricePHP: number;
  quantity: number;
  type: string;
}

export interface MaterialCostInput {
  type: string;
  quantity: number;
  pipeRunMeters?: number;
}

export interface ProjectCostInput {
  equipment: EquipmentCostInput[];
  materials?: MaterialCostInput[];
  laborMultiplier?: number;
  overheadPercent?: number;
  contingencyPercent?: number;
  vatRate?: number;
}

export interface CostBreakdown {
  equipmentCost: number;
  materialCost: number;
  laborCost: number;
  subtotal: number;
  overhead: number;
  contingency: number;
  netTotal: number;
  vat: number;
  grandTotal: number;
}

/** Get brand tier for a manufacturer, defaulting to 'mid' */
export function getBrandTier(manufacturer: string): BrandTier {
  return BRAND_TIERS[manufacturer] ?? 'mid';
}

/** Calculate total equipment cost with tier-aware pricing (rules → constant fallback) */
export function calculateEquipmentCost(items: EquipmentCostInput[]): number {
  return items.reduce((total, item) => {
    // Try rules engine first for brand-specific multiplier, then fall back to tiers
    const rulesMultiplier = getRuleTierMultiplier(item.manufacturer);
    if (rulesMultiplier !== null) {
      return total + item.unitPricePHP * rulesMultiplier * item.quantity;
    }
    const tier = getBrandTier(item.manufacturer);
    const multiplier = TIER_MULTIPLIERS[tier];
    return total + item.unitPricePHP * multiplier * item.quantity;
  }, 0);
}

/** Calculate material cost based on system types and pipe runs */
export function calculateMaterialCost(items: MaterialCostInput[]): number {
  return items.reduce((total, item) => {
    const pipeRun = item.pipeRunMeters ?? DEFAULT_PIPE_RUNS[item.type] ?? 5;
    const perUnit =
      MATERIAL_PRICES.copperPipeLiquidPerMeter * pipeRun +
      MATERIAL_PRICES.copperPipeGasPerMeter * pipeRun +
      MATERIAL_PRICES.insulationPerMeter * pipeRun +
      MATERIAL_PRICES.drainPipePerMeter * pipeRun +
      MATERIAL_PRICES.electricalWirePerMeter * pipeRun +
      MATERIAL_PRICES.circuitBreakerPerUnit +
      (item.type === 'ceiling_cassette'
        ? MATERIAL_PRICES.ceilingBracketPerSet
        : MATERIAL_PRICES.wallBracketPerSet);
    return total + perUnit * item.quantity;
  }, 0);
}

/** Calculate labor cost as a percentage of equipment cost */
export function calculateLaborCost(
  equipmentCost: number,
  multiplier?: number,
): number {
  const rate = Math.min(
    LABOR_RATES.maxPercent,
    Math.max(LABOR_RATES.minPercent, multiplier ?? LABOR_RATES.defaultPercent),
  );
  return equipmentCost * rate;
}

/** Calculate full project cost with overhead, contingency, and VAT */
export function calculateTotalProjectCost(input: ProjectCostInput): CostBreakdown {
  const equipmentCost = calculateEquipmentCost(input.equipment);

  const materialItems: MaterialCostInput[] =
    input.materials ??
    input.equipment.map((e) => ({
      type: e.type,
      quantity: e.quantity,
    }));
  const materialCost = calculateMaterialCost(materialItems);

  const laborCost = calculateLaborCost(equipmentCost, input.laborMultiplier);

  const subtotal = equipmentCost + materialCost + laborCost;

  const overheadRate = input.overheadPercent ?? getPricingConstant('overhead_percent', PROJECT_OVERHEAD.overheadPercent);
  const contingencyRate = input.contingencyPercent ?? getPricingConstant('contingency_percent', PROJECT_OVERHEAD.contingencyPercent);
  const vatRate = input.vatRate ?? getPricingConstant('vat_percent', PROJECT_OVERHEAD.vatPercent);

  const overhead = subtotal * overheadRate;
  const contingency = subtotal * contingencyRate;
  const netTotal = subtotal + overhead + contingency;
  const vat = netTotal * vatRate;
  const grandTotal = netTotal + vat;

  return {
    equipmentCost: Math.round(equipmentCost),
    materialCost: Math.round(materialCost),
    laborCost: Math.round(laborCost),
    subtotal: Math.round(subtotal),
    overhead: Math.round(overhead),
    contingency: Math.round(contingency),
    netTotal: Math.round(netTotal),
    vat: Math.round(vat),
    grandTotal: Math.round(grandTotal),
  };
}
