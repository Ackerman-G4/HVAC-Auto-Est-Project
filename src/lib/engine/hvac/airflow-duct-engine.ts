import { getRuleSetSync } from '@/lib/engine/rules';
import { constantFromRuleSet } from '@/lib/engine/rules/rule-evaluator';

export interface AirflowInputs {
  supplyCfm: number;
  branches: number;
  trunkLengthFt: number;
  longestBranchLengthFt: number;
  frictionRateInWgPer100Ft: number;
  targetVelocityFpm: number;
  fanEfficiency: number;
  fittingLossFactor: number;
}

export type AirflowValidationSeverity = 'error' | 'warning';

export type AirflowValidationField = keyof AirflowInputs | 'manualStaticPressureInWg' | 'crossField';

export interface AirflowValidationIssue {
  field: AirflowValidationField;
  message: string;
  severity: AirflowValidationSeverity;
}

export interface AirflowOverrideState {
  useManualStaticPressure: boolean;
  manualStaticPressureInWg: number | null;
}

export interface BranchSizingRow {
  branch: string;
  designCfm: number;
  velocityFpm: number;
  roundDiameterIn: number;
  rectangularSizeIn: string;
  pressureDropInWg: number;
}

export interface AirflowFormulaRow {
  label: string;
  expression: string;
  value: string;
}

export interface AirflowResult {
  totalStaticPressureInWg: number;
  requiredFanPowerHp: number;
  requiredFanPowerKw: number;
  trunkDiameterIn: number;
  branchRows: BranchSizingRow[];
  formulas: AirflowFormulaRow[];
  alerts: string[];
  validationIssues: AirflowValidationIssue[];
}

// ─── Rules-driven constants ─────────────────────────────────────────

function getDuctConstant(name: string, fallback: number): number {
  try {
    return constantFromRuleSet(getRuleSetSync('duct_sizing'), 'duct_sizing_constants', name);
  } catch { return fallback; }
}

function getStandardDiameters(): number[] {
  try {
    const rules = getRuleSetSync('duct_sizing');
    const rule = rules.rules.find(r => r.id === 'standard_round_diameters');
    if (rule && rule.type === 'lookup') {
      return Object.values(rule.table).map(Number).sort((a, b) => a - b);
    }
  } catch { /* use fallback */ }
  return [6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
}

const STANDARD_ROUND_DUCT_DIAMETERS_IN = getStandardDiameters();

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeAirflowInputs(inputs: AirflowInputs): AirflowInputs {
  return {
    supplyCfm: clamp(finiteOr(inputs.supplyCfm, defaultAirflowInputs.supplyCfm), 200, 60000),
    branches: clamp(Math.round(finiteOr(inputs.branches, defaultAirflowInputs.branches)), 1, 12),
    trunkLengthFt: clamp(finiteOr(inputs.trunkLengthFt, defaultAirflowInputs.trunkLengthFt), 10, 800),
    longestBranchLengthFt: clamp(finiteOr(inputs.longestBranchLengthFt, defaultAirflowInputs.longestBranchLengthFt), 5, 600),
    frictionRateInWgPer100Ft: clamp(
      finiteOr(inputs.frictionRateInWgPer100Ft, defaultAirflowInputs.frictionRateInWgPer100Ft),
      0.03,
      0.3,
    ),
    targetVelocityFpm: clamp(finiteOr(inputs.targetVelocityFpm, defaultAirflowInputs.targetVelocityFpm), 500, 1800),
    fanEfficiency: clamp(finiteOr(inputs.fanEfficiency, defaultAirflowInputs.fanEfficiency), 0.4, 0.85),
    fittingLossFactor: clamp(finiteOr(inputs.fittingLossFactor, defaultAirflowInputs.fittingLossFactor), 0, 4),
  };
}

function normalizeAirflowOverrides(overrides: AirflowOverrideState): AirflowOverrideState {
  if (!overrides.useManualStaticPressure) {
    return {
      ...overrides,
      manualStaticPressureInWg: null,
    };
  }

  const manualStatic = overrides.manualStaticPressureInWg;
  if (!Number.isFinite(manualStatic) || manualStatic === null) {
    return {
      ...overrides,
      manualStaticPressureInWg: null,
    };
  }

  return {
    ...overrides,
    manualStaticPressureInWg: clamp(manualStatic, 0.1, 8),
  };
}

function pushBoundIssue(
  issues: AirflowValidationIssue[],
  field: keyof AirflowInputs,
  value: number,
  min: number,
  max: number,
  label: string,
): void {
  if (!Number.isFinite(value)) {
    issues.push({
      field,
      severity: 'error',
      message: `${label} must be a valid number.`,
    });
    return;
  }

  if (value < min || value > max) {
    issues.push({
      field,
      severity: 'error',
      message: `${label} must be between ${min} and ${max}.`,
    });
  }
}

export function validateAirflowScenario(
  inputs: AirflowInputs,
  overrides: AirflowOverrideState,
): AirflowValidationIssue[] {
  const issues: AirflowValidationIssue[] = [];

  pushBoundIssue(issues, 'supplyCfm', inputs.supplyCfm, 200, 60000, 'Supply CFM');
  pushBoundIssue(issues, 'branches', inputs.branches, 1, 12, 'Branches');
  pushBoundIssue(issues, 'trunkLengthFt', inputs.trunkLengthFt, 10, 800, 'Trunk Length');
  pushBoundIssue(issues, 'longestBranchLengthFt', inputs.longestBranchLengthFt, 5, 600, 'Longest Branch Length');
  pushBoundIssue(issues, 'frictionRateInWgPer100Ft', inputs.frictionRateInWgPer100Ft, 0.03, 0.3, 'Friction Rate');
  pushBoundIssue(issues, 'targetVelocityFpm', inputs.targetVelocityFpm, 500, 1800, 'Target Velocity');
  pushBoundIssue(issues, 'fanEfficiency', inputs.fanEfficiency, 0.4, 0.85, 'Fan Efficiency');
  pushBoundIssue(issues, 'fittingLossFactor', inputs.fittingLossFactor, 0, 4, 'Fitting Loss');

  if (Number.isFinite(inputs.branches) && !Number.isInteger(inputs.branches)) {
    issues.push({
      field: 'branches',
      severity: 'warning',
      message: 'Branches should be a whole number; value will be rounded.',
    });
  }

  if (
    Number.isFinite(inputs.trunkLengthFt)
    && Number.isFinite(inputs.longestBranchLengthFt)
    && inputs.longestBranchLengthFt > inputs.trunkLengthFt + 50
  ) {
    issues.push({
      field: 'crossField',
      severity: 'warning',
      message: 'Longest branch is much greater than trunk length. Verify routing assumptions.',
    });
  }

  if (
    Number.isFinite(inputs.supplyCfm)
    && Number.isFinite(inputs.branches)
    && inputs.branches > 0
    && inputs.supplyCfm / inputs.branches < 150
  ) {
    issues.push({
      field: 'crossField',
      severity: 'warning',
      message: 'Average branch airflow is very low; branch count may be too high for supply CFM.',
    });
  }

  if (overrides.useManualStaticPressure) {
    if (!Number.isFinite(overrides.manualStaticPressureInWg) || overrides.manualStaticPressureInWg === null) {
      issues.push({
        field: 'manualStaticPressureInWg',
        severity: 'error',
        message: 'Manual static pressure must be set when override is enabled.',
      });
    } else if (overrides.manualStaticPressureInWg < 0.1 || overrides.manualStaticPressureInWg > 8) {
      issues.push({
        field: 'manualStaticPressureInWg',
        severity: 'error',
        message: 'Manual static pressure must be between 0.1 and 8 in.wg.',
      });
    }
  }

  return issues;
}

export function hasCriticalAirflowValidationIssues(issues: AirflowValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

function nearestStandardDiameterIn(target: number): number {
  const found = STANDARD_ROUND_DUCT_DIAMETERS_IN.find((item) => item >= target);
  return found ?? STANDARD_ROUND_DUCT_DIAMETERS_IN[STANDARD_ROUND_DUCT_DIAMETERS_IN.length - 1];
}

function designDiameterFromCfm(cfm: number, velocityFpm: number) {
  const areaSqFt = cfm / Math.max(1, velocityFpm);
  const diameterFt = Math.sqrt((4 * areaSqFt) / Math.PI);
  return diameterFt * 12;
}

function toRectangularFromRound(diameterIn: number) {
  const areaIn2 = Math.PI * (diameterIn / 2) * (diameterIn / 2);
  const width = Math.max(8, Math.round(Math.sqrt(areaIn2 * 1.6) / 2) * 2);
  const height = Math.max(6, Math.round((areaIn2 / width) / 2) * 2);
  return `${width}x${height}`;
}

function buildBranchRatios(branches: number): number[] {
  const branchBoost = getDuctConstant('branch_boost_first', 0.06);
  const branchReduce = getDuctConstant('branch_reduce_last', 0.06);

  if (branches <= 1) {
    return [1];
  }

  const base = Array.from({ length: branches }, () => 1 / branches);
  base[0] += branchBoost;
  base[branches - 1] -= branchReduce;
  return base;
}

export function calculateAirflowScenario(
  inputs: AirflowInputs,
  overrides: AirflowOverrideState,
): AirflowResult {
  const validationIssues = validateAirflowScenario(inputs, overrides);
  const normalizedInputs = normalizeAirflowInputs(inputs);
  const normalizedOverrides = normalizeAirflowOverrides(overrides);

  const branchRatios = buildBranchRatios(normalizedInputs.branches);
  const branchRows = branchRatios.map((ratio, index) => {
    const designCfm = normalizedInputs.supplyCfm * ratio;
    const diameterInRaw = designDiameterFromCfm(designCfm, normalizedInputs.targetVelocityFpm);
    const diameterIn = nearestStandardDiameterIn(diameterInRaw);
    const velocityFpm = designCfm / (Math.PI * (diameterIn / 24) * (diameterIn / 24));
    const pressureDropInWg =
      (normalizedInputs.frictionRateInWgPer100Ft * normalizedInputs.longestBranchLengthFt) / 100;

    return {
      branch: `Branch ${index + 1}`,
      designCfm: round(designCfm),
      velocityFpm: round(velocityFpm),
      roundDiameterIn: diameterIn,
      rectangularSizeIn: toRectangularFromRound(diameterIn),
      pressureDropInWg: round(pressureDropInWg),
    };
  });

  const trunkDiameterRaw = designDiameterFromCfm(normalizedInputs.supplyCfm, normalizedInputs.targetVelocityFpm * 0.9);
  const trunkDiameterIn = nearestStandardDiameterIn(trunkDiameterRaw);

  const frictionStatic =
    (normalizedInputs.frictionRateInWgPer100Ft * (normalizedInputs.trunkLengthFt + normalizedInputs.longestBranchLengthFt)) / 100;
  const fittingStatic = normalizedInputs.fittingLossFactor;
  const computedStatic = frictionStatic + fittingStatic;

  const totalStaticPressureInWg = normalizedOverrides.useManualStaticPressure && normalizedOverrides.manualStaticPressureInWg
    ? normalizedOverrides.manualStaticPressureInWg
    : computedStatic;

  const requiredFanPowerHp =
    (normalizedInputs.supplyCfm * totalStaticPressureInWg) /
    (6356 * normalizedInputs.fanEfficiency);
  const requiredFanPowerKw = requiredFanPowerHp * getDuctConstant('hp_to_kw', 0.746);

  const formulas: AirflowFormulaRow[] = [
    {
      label: 'Round Duct Diameter',
      expression: 'D(ft) = sqrt((4 x CFM / Velocity) / pi)',
      value: `Trunk diameter = ${trunkDiameterIn} in`,
    },
    {
      label: 'Friction Static Pressure',
      expression: 'SP_f = FrictionRate x EquivalentLength / 100',
      value: `${normalizedInputs.frictionRateInWgPer100Ft} x ${normalizedInputs.trunkLengthFt + normalizedInputs.longestBranchLengthFt} / 100 = ${round(frictionStatic)} in.wg`,
    },
    {
      label: 'Total Static Pressure',
      expression: 'SP_t = SP_f + FittingLoss',
      value: `${round(frictionStatic)} + ${normalizedInputs.fittingLossFactor} = ${round(totalStaticPressureInWg)} in.wg`,
    },
    {
      label: 'Fan Power',
      expression: 'HP = (CFM x SP) / (6356 x FanEff)',
      value: `(${normalizedInputs.supplyCfm} x ${round(totalStaticPressureInWg)}) / (6356 x ${normalizedInputs.fanEfficiency}) = ${round(requiredFanPowerHp)} HP`,
    },
  ];

  const alerts: string[] = [];

  const maxStaticWarning = getDuctConstant('max_static_pressure_warning', 4);
  const maxFanPowerWarning = getDuctConstant('max_fan_power_hp_warning', 15);
  const maxBranchVelocity = getDuctConstant('max_branch_velocity_fpm', 1400);

  if (totalStaticPressureInWg > maxStaticWarning) {
    alerts.push('Static pressure is high; review duct routing and fitting count.');
  }

  if (requiredFanPowerHp > maxFanPowerWarning) {
    alerts.push('Fan power requirement is high; evaluate zoning or lower velocity design.');
  }

  if (branchRows.some((row) => row.velocityFpm > maxBranchVelocity)) {
    alerts.push(`One or more branches exceed ${maxBranchVelocity} FPM; potential noise and pressure issues.`);
  }

  return {
    totalStaticPressureInWg: round(totalStaticPressureInWg),
    requiredFanPowerHp: round(requiredFanPowerHp),
    requiredFanPowerKw: round(requiredFanPowerKw),
    trunkDiameterIn,
    branchRows,
    formulas,
    alerts,
    validationIssues,
  };
}

export const defaultAirflowInputs: AirflowInputs = {
  supplyCfm: 6500,
  branches: 4,
  trunkLengthFt: 95,
  longestBranchLengthFt: 62,
  frictionRateInWgPer100Ft: 0.08,
  targetVelocityFpm: 1050,
  fanEfficiency: 0.62,
  fittingLossFactor: 0.9,
};

export const defaultAirflowOverrides: AirflowOverrideState = {
  useManualStaticPressure: false,
  manualStaticPressureInWg: null,
};
