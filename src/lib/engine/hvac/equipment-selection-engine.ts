import { getRuleSetSync } from '@/lib/engine/rules';
import { constantFromRuleSet, lookupFromRuleSet } from '@/lib/engine/rules/rule-evaluator';

export type BudgetBand = 'economy' | 'balanced' | 'premium';
export type OptimizationPriority = 'capex' | 'efficiency' | 'balanced';

// ─── Rules-driven constants ─────────────────────────────────────────

function getEquipmentConstant(name: string, fallback: number): number {
  try {
    return constantFromRuleSet(getRuleSetSync('equipment'), 'equipment_constants', name);
  } catch { return fallback; }
}

function getScoringWeight(priority: OptimizationPriority, weightName: string, fallback: number): number {
  try {
    const ruleId = `scoring_weights_${priority}`;
    return lookupFromRuleSet(getRuleSetSync('equipment'), ruleId, weightName);
  } catch { return fallback; }
}

export interface EquipmentSelectionInputs {
  requiredTr: number;
  budgetBand: BudgetBand;
  optimizationPriority: OptimizationPriority;
  redundancyNPlusOne: boolean;
  electricityRatePhpKwh: number;
  operatingHoursPerYear: number;
  maxUnits: number;
}

export interface EquipmentSelectionOverrides {
  lockOptionId: string | null;
}

export interface EquipmentCandidate {
  id: string;
  model: string;
  type: 'inverter_split' | 'cassette' | 'ducted' | 'vrf';
  quantity: number;
  providedTr: number;
  utilizationPct: number;
  capexPhp: number;
  annualEnergyKwh: number;
  annualEnergyCostPhp: number;
  totalLifecyclePhp: number;
  score: number;
}

export interface EquipmentFormulaRow {
  label: string;
  expression: string;
  value: string;
}

export interface EquipmentSelectionResult {
  candidates: EquipmentCandidate[];
  selectedCandidateId: string | null;
  formulas: EquipmentFormulaRow[];
  alerts: string[];
}

interface CatalogItem {
  model: string;
  type: 'inverter_split' | 'cassette' | 'ducted' | 'vrf';
  capacityTr: number;
  eer: number;
  capexPhp: number;
  budgetBand: BudgetBand;
}

const CATALOG: CatalogItem[] = [
  {
    model: 'AeroCore Split 2.0TR',
    type: 'inverter_split',
    capacityTr: 2,
    eer: 12.8,
    capexPhp: 54000,
    budgetBand: 'economy',
  },
  {
    model: 'AeroCore Cassette 3.0TR',
    type: 'cassette',
    capacityTr: 3,
    eer: 12.1,
    capexPhp: 92000,
    budgetBand: 'balanced',
  },
  {
    model: 'AeroCore Ducted 5.0TR',
    type: 'ducted',
    capacityTr: 5,
    eer: 11.5,
    capexPhp: 168000,
    budgetBand: 'balanced',
  },
  {
    model: 'AeroCore VRF 8.0TR',
    type: 'vrf',
    capacityTr: 8,
    eer: 13.2,
    capexPhp: 296000,
    budgetBand: 'premium',
  },
  {
    model: 'AeroCore VRF 12.0TR',
    type: 'vrf',
    capacityTr: 12,
    eer: 13.7,
    capexPhp: 412000,
    budgetBand: 'premium',
  },
];

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function scoreCandidate(
  candidate: EquipmentCandidate,
  inputs: EquipmentSelectionInputs,
  maxCapex: number,
  minCapex: number,
): number {
  const capacityScore = 100 - Math.abs(100 - candidate.utilizationPct) * 1.2;
  const efficiencyScore = clamp((candidate.annualEnergyKwh > 0 ? 250000 / candidate.annualEnergyKwh : 0), 0, 100);
  const capexSpan = Math.max(1, maxCapex - minCapex);
  const capexScore = 100 - (((candidate.capexPhp - minCapex) / capexSpan) * 100);

  const wCapacity = getScoringWeight(inputs.optimizationPriority, 'capacity', inputs.optimizationPriority === 'balanced' ? 0.4 : 0.3);
  const wEfficiency = getScoringWeight(inputs.optimizationPriority, 'efficiency', inputs.optimizationPriority === 'efficiency' ? 0.5 : inputs.optimizationPriority === 'capex' ? 0.2 : 0.3);
  const wCapex = getScoringWeight(inputs.optimizationPriority, 'capex', inputs.optimizationPriority === 'capex' ? 0.5 : inputs.optimizationPriority === 'efficiency' ? 0.2 : 0.3);

  const score = capacityScore * wCapacity + efficiencyScore * wEfficiency + capexScore * wCapex;

  return round(clamp(score, 0, 100));
}

function filterCatalog(inputs: EquipmentSelectionInputs): CatalogItem[] {
  if (inputs.budgetBand === 'balanced') {
    return CATALOG;
  }

  return CATALOG.filter((item) => item.budgetBand === inputs.budgetBand || item.budgetBand === 'balanced');
}

export function calculateEquipmentSelection(
  inputs: EquipmentSelectionInputs,
  overrides: EquipmentSelectionOverrides,
): EquipmentSelectionResult {
  const filtered = filterCatalog(inputs);
  const redundancyMultiplier = getEquipmentConstant('redundancy_multiplier', 1.15);
  const maxCandidates = getEquipmentConstant('max_candidates', 12);
  const targetTr = inputs.redundancyNPlusOne ? inputs.requiredTr * redundancyMultiplier : inputs.requiredTr;

  const candidates: EquipmentCandidate[] = filtered.flatMap((item) => {
    const minQty = Math.max(1, Math.ceil(targetTr / item.capacityTr));
    const maxQty = Math.max(minQty, inputs.maxUnits);

    const options: EquipmentCandidate[] = [];

    for (let qty = minQty; qty <= maxQty; qty += 1) {
      const providedTr = qty * item.capacityTr;
      const utilizationPct = (inputs.requiredTr / Math.max(0.1, providedTr)) * 100;
      const capexPhp = qty * item.capexPhp;
      const annualEnergyKwh = (providedTr * 12000 * inputs.operatingHoursPerYear) / (item.eer * 1000);
      const annualEnergyCostPhp = annualEnergyKwh * inputs.electricityRatePhpKwh;
      const totalLifecyclePhp = capexPhp + annualEnergyCostPhp * 5;

      options.push({
        id: `${item.model}-${qty}`,
        model: item.model,
        type: item.type,
        quantity: qty,
        providedTr: round(providedTr),
        utilizationPct: round(utilizationPct),
        capexPhp: round(capexPhp),
        annualEnergyKwh: round(annualEnergyKwh),
        annualEnergyCostPhp: round(annualEnergyCostPhp),
        totalLifecyclePhp: round(totalLifecyclePhp),
        score: 0,
      });
    }

    return options;
  });

  const maxCapex = Math.max(...candidates.map((item) => item.capexPhp));
  const minCapex = Math.min(...candidates.map((item) => item.capexPhp));

  const scored = candidates
    .map((item) => ({
      ...item,
      score: scoreCandidate(item, inputs, maxCapex, minCapex),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates);

  const selectedCandidateId = overrides.lockOptionId && scored.some((item) => item.id === overrides.lockOptionId)
    ? overrides.lockOptionId
    : (scored[0]?.id ?? null);

  const formulas: EquipmentFormulaRow[] = [
    {
      label: 'Capacity Target',
      expression: 'Target TR = Required TR x Redundancy Factor',
      value: `${inputs.requiredTr.toFixed(2)} x ${inputs.redundancyNPlusOne ? redundancyMultiplier.toFixed(2) : '1.00'} = ${targetTr.toFixed(2)} TR`,
    },
    {
      label: 'Energy Use',
      expression: 'kWh = (Provided TR x 12000 x Hours) / (EER x 1000)',
      value: 'Computed per candidate option',
    },
    {
      label: 'Lifecycle Cost',
      expression: 'Lifecycle PHP = Capex + (Annual Energy Cost x 5 years)',
      value: 'Compared in candidate matrix',
    },
  ];

  const alerts: string[] = [];
  if (scored.length === 0) {
    alerts.push('No equipment candidates satisfy the current constraints.');
  }

  if (scored.some((item) => item.utilizationPct > 120)) {
    alerts.push('Some shortlisted candidates are over-utilized; verify redundancy or quantity.');
  }

  if (inputs.redundancyNPlusOne) {
    alerts.push('N+1 redundancy is active: target capacity increased by 15%.');
  }

  return {
    candidates: scored,
    selectedCandidateId,
    formulas,
    alerts,
  };
}

export const defaultEquipmentSelectionInputs: EquipmentSelectionInputs = {
  requiredTr: 8.3,
  budgetBand: 'balanced',
  optimizationPriority: 'balanced',
  redundancyNPlusOne: false,
  electricityRatePhpKwh: 12.2,
  operatingHoursPerYear: 3200,
  maxUnits: 6,
};

export const defaultEquipmentSelectionOverrides: EquipmentSelectionOverrides = {
  lockOptionId: null,
};
