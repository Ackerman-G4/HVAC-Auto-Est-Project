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
}

const STANDARD_ROUND_DUCT_DIAMETERS_IN = [
  6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30,
];

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
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
  if (branches <= 1) {
    return [1];
  }

  const base = Array.from({ length: branches }, () => 1 / branches);
  base[0] += 0.06;
  base[branches - 1] -= 0.06;
  return base;
}

export function calculateAirflowScenario(
  inputs: AirflowInputs,
  overrides: AirflowOverrideState,
): AirflowResult {
  const branchRatios = buildBranchRatios(inputs.branches);
  const branchRows = branchRatios.map((ratio, index) => {
    const designCfm = inputs.supplyCfm * ratio;
    const diameterInRaw = designDiameterFromCfm(designCfm, inputs.targetVelocityFpm);
    const diameterIn = nearestStandardDiameterIn(diameterInRaw);
    const velocityFpm = designCfm / (Math.PI * (diameterIn / 24) * (diameterIn / 24));
    const pressureDropInWg =
      (inputs.frictionRateInWgPer100Ft * inputs.longestBranchLengthFt) / 100;

    return {
      branch: `Branch ${index + 1}`,
      designCfm: round(designCfm),
      velocityFpm: round(velocityFpm),
      roundDiameterIn: diameterIn,
      rectangularSizeIn: toRectangularFromRound(diameterIn),
      pressureDropInWg: round(pressureDropInWg),
    };
  });

  const trunkDiameterRaw = designDiameterFromCfm(inputs.supplyCfm, inputs.targetVelocityFpm * 0.9);
  const trunkDiameterIn = nearestStandardDiameterIn(trunkDiameterRaw);

  const frictionStatic =
    (inputs.frictionRateInWgPer100Ft * (inputs.trunkLengthFt + inputs.longestBranchLengthFt)) / 100;
  const fittingStatic = inputs.fittingLossFactor;
  const computedStatic = frictionStatic + fittingStatic;

  const totalStaticPressureInWg = overrides.useManualStaticPressure && overrides.manualStaticPressureInWg
    ? overrides.manualStaticPressureInWg
    : computedStatic;

  const requiredFanPowerHp =
    (inputs.supplyCfm * totalStaticPressureInWg) /
    (6356 * clamp(inputs.fanEfficiency, 0.4, 0.85));
  const requiredFanPowerKw = requiredFanPowerHp * 0.746;

  const formulas: AirflowFormulaRow[] = [
    {
      label: 'Round Duct Diameter',
      expression: 'D(ft) = sqrt((4 x CFM / Velocity) / pi)',
      value: `Trunk diameter = ${trunkDiameterIn} in`,
    },
    {
      label: 'Friction Static Pressure',
      expression: 'SP_f = FrictionRate x EquivalentLength / 100',
      value: `${inputs.frictionRateInWgPer100Ft} x ${inputs.trunkLengthFt + inputs.longestBranchLengthFt} / 100 = ${round(frictionStatic)} in.wg`,
    },
    {
      label: 'Total Static Pressure',
      expression: 'SP_t = SP_f + FittingLoss',
      value: `${round(frictionStatic)} + ${inputs.fittingLossFactor} = ${round(totalStaticPressureInWg)} in.wg`,
    },
    {
      label: 'Fan Power',
      expression: 'HP = (CFM x SP) / (6356 x FanEff)',
      value: `(${inputs.supplyCfm} x ${round(totalStaticPressureInWg)}) / (6356 x ${inputs.fanEfficiency}) = ${round(requiredFanPowerHp)} HP`,
    },
  ];

  const alerts: string[] = [];

  if (totalStaticPressureInWg > 4) {
    alerts.push('Static pressure is high; review duct routing and fitting count.');
  }

  if (requiredFanPowerHp > 15) {
    alerts.push('Fan power requirement is high; evaluate zoning or lower velocity design.');
  }

  if (branchRows.some((row) => row.velocityFpm > 1400)) {
    alerts.push('One or more branches exceed 1400 FPM; potential noise and pressure issues.');
  }

  return {
    totalStaticPressureInWg: round(totalStaticPressureInWg),
    requiredFanPowerHp: round(requiredFanPowerHp),
    requiredFanPowerKw: round(requiredFanPowerKw),
    trunkDiameterIn,
    branchRows,
    formulas,
    alerts,
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
