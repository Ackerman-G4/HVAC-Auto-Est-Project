export type SpaceType =
  | 'office'
  | 'retail'
  | 'residential'
  | 'server_room'
  | 'conference_room'
  | 'restaurant';

export interface LoadCalculationInputs {
  projectName: string;
  spaceType: SpaceType;
  areaM2: number;
  ceilingHeightM: number;
  occupants: number;
  outdoorTempC: number;
  indoorTempC: number;
  lightingWPerM2: number;
  equipmentLoadW: number;
  ventilationCfmPerPerson: number;
  safetyFactor: number;
  diversityFactor: number;
  supplyDeltaTF: number;
}

export interface ManualOverrides {
  useManualTotalBtu: boolean;
  manualTotalBtu: number | null;
  useManualCfm: boolean;
  manualCfm: number | null;
}

export interface LoadBreakdown {
  envelopeBtu: number;
  peopleBtu: number;
  lightingBtu: number;
  equipmentBtu: number;
  ventilationBtu: number;
  totalBtuBeforeFactors: number;
  totalBtuAfterFactors: number;
  trRequired: number;
  cfmRequired: number;
}

export interface EquipmentOption {
  model: string;
  type: 'inverter_split' | 'vrf' | 'cassette' | 'ducted';
  capacityTr: number;
  efficiencyEer: number;
  estimatedPhp: number;
  quantity: number;
  utilization: number;
  annualEnergyKwh: number;
}

export interface AirflowNode {
  zone: string;
  cfm: number;
  velocityFpm: number;
}

export interface FormulaRow {
  label: string;
  expression: string;
  value: string;
}

export interface LoadCalculationResult {
  breakdown: LoadBreakdown;
  equipmentOptions: EquipmentOption[];
  airflowMap: AirflowNode[];
  formulas: FormulaRow[];
  alerts: string[];
}

const SPACE_ENVELOPE_BTU_PER_M2: Record<SpaceType, number> = {
  office: 120,
  retail: 140,
  residential: 95,
  server_room: 220,
  conference_room: 135,
  restaurant: 180,
};

const PEOPLE_BTU_PER_PERSON = 245;
const WATT_TO_BTU_PER_HR = 3.412;
const CFM_CONSTANT = 1.08;

const CATALOG: Array<Pick<EquipmentOption, 'model' | 'type' | 'capacityTr' | 'efficiencyEer' | 'estimatedPhp'>> = [
  {
    model: 'AeroCore Split 2.0TR',
    type: 'inverter_split',
    capacityTr: 2,
    efficiencyEer: 12.8,
    estimatedPhp: 54000,
  },
  {
    model: 'AeroCore Cassette 3.0TR',
    type: 'cassette',
    capacityTr: 3,
    efficiencyEer: 12.1,
    estimatedPhp: 92000,
  },
  {
    model: 'AeroCore Ducted 5.0TR',
    type: 'ducted',
    capacityTr: 5,
    efficiencyEer: 11.5,
    estimatedPhp: 168000,
  },
  {
    model: 'AeroCore VRF 8.0TR',
    type: 'vrf',
    capacityTr: 8,
    efficiencyEer: 13.2,
    estimatedPhp: 296000,
  },
];

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function celsiusToFahrenheit(value: number) {
  return value * 1.8 + 32;
}

function calculateBreakdown(inputs: LoadCalculationInputs, overrides: ManualOverrides): LoadBreakdown {
  const deltaTF = Math.max(1, celsiusToFahrenheit(inputs.outdoorTempC - inputs.indoorTempC));
  const envelopeBtu = inputs.areaM2 * SPACE_ENVELOPE_BTU_PER_M2[inputs.spaceType];
  const peopleBtu = inputs.occupants * PEOPLE_BTU_PER_PERSON;
  const lightingBtu = inputs.areaM2 * inputs.lightingWPerM2 * WATT_TO_BTU_PER_HR;
  const equipmentBtu = inputs.equipmentLoadW * WATT_TO_BTU_PER_HR;
  const ventilationCfm = inputs.occupants * inputs.ventilationCfmPerPerson;
  const ventilationBtu = CFM_CONSTANT * ventilationCfm * deltaTF;

  const totalBtuBeforeFactors = envelopeBtu + peopleBtu + lightingBtu + equipmentBtu + ventilationBtu;
  const adjustedByFactor = totalBtuBeforeFactors * inputs.safetyFactor * inputs.diversityFactor;
  const totalBtuAfterFactors = overrides.useManualTotalBtu && overrides.manualTotalBtu
    ? overrides.manualTotalBtu
    : adjustedByFactor;

  const trRequired = totalBtuAfterFactors / 12000;
  const computedCfm = totalBtuAfterFactors / (CFM_CONSTANT * Math.max(1, inputs.supplyDeltaTF));
  const cfmRequired = overrides.useManualCfm && overrides.manualCfm ? overrides.manualCfm : computedCfm;

  return {
    envelopeBtu: round(envelopeBtu),
    peopleBtu: round(peopleBtu),
    lightingBtu: round(lightingBtu),
    equipmentBtu: round(equipmentBtu),
    ventilationBtu: round(ventilationBtu),
    totalBtuBeforeFactors: round(totalBtuBeforeFactors),
    totalBtuAfterFactors: round(totalBtuAfterFactors),
    trRequired: round(trRequired),
    cfmRequired: round(cfmRequired),
  };
}

function buildEquipmentOptions(trRequired: number): EquipmentOption[] {
  return CATALOG.map((item) => {
    const quantity = Math.max(1, Math.ceil(trRequired / item.capacityTr));
    const providedTr = quantity * item.capacityTr;
    const utilization = clamp((trRequired / Math.max(0.1, providedTr)) * 100, 0, 160);
    const annualEnergyKwh = (providedTr * 12000 * 1200) / (item.efficiencyEer * 1000);

    return {
      ...item,
      quantity,
      utilization: round(utilization),
      annualEnergyKwh: round(annualEnergyKwh),
    };
  }).sort((a, b) => b.utilization - a.utilization);
}

function buildAirflowMap(cfm: number): AirflowNode[] {
  const zones = [
    { zone: 'Perimeter', ratio: 0.4, velocityFactor: 1.15 },
    { zone: 'Core', ratio: 0.35, velocityFactor: 0.95 },
    { zone: 'High-Load Nodes', ratio: 0.25, velocityFactor: 1.28 },
  ];

  return zones.map((item) => {
    const zoneCfm = cfm * item.ratio;
    const velocityFpm = (zoneCfm / 10) * item.velocityFactor;
    return {
      zone: item.zone,
      cfm: round(zoneCfm),
      velocityFpm: round(velocityFpm),
    };
  });
}

function buildFormulas(inputs: LoadCalculationInputs, breakdown: LoadBreakdown): FormulaRow[] {
  const airflow = inputs.occupants * inputs.ventilationCfmPerPerson;
  const deltaTF = Math.max(1, celsiusToFahrenheit(inputs.outdoorTempC - inputs.indoorTempC));

  return [
    {
      label: 'Envelope Load',
      expression: 'Envelope BTU = Area x Space Factor',
      value: `${inputs.areaM2} x ${SPACE_ENVELOPE_BTU_PER_M2[inputs.spaceType]} = ${breakdown.envelopeBtu.toLocaleString()} BTU/h`,
    },
    {
      label: 'Lighting Load',
      expression: 'Lighting BTU = Area x Lighting Density x 3.412',
      value: `${inputs.areaM2} x ${inputs.lightingWPerM2} x 3.412 = ${breakdown.lightingBtu.toLocaleString()} BTU/h`,
    },
    {
      label: 'Ventilation Load',
      expression: 'Ventilation BTU = 1.08 x CFM x DeltaT(F)',
      value: `1.08 x ${airflow.toFixed(1)} x ${deltaTF.toFixed(1)} = ${breakdown.ventilationBtu.toLocaleString()} BTU/h`,
    },
    {
      label: 'Design Load',
      expression: 'Design BTU = Raw Total x Safety x Diversity',
      value: `${breakdown.totalBtuBeforeFactors.toLocaleString()} x ${inputs.safetyFactor} x ${inputs.diversityFactor} = ${breakdown.totalBtuAfterFactors.toLocaleString()} BTU/h`,
    },
    {
      label: 'Airflow Requirement',
      expression: 'CFM = BTU / (1.08 x Supply DeltaT(F))',
      value: `${breakdown.totalBtuAfterFactors.toLocaleString()} / (1.08 x ${inputs.supplyDeltaTF}) = ${breakdown.cfmRequired.toLocaleString()} CFM`,
    },
  ];
}

function buildAlerts(inputs: LoadCalculationInputs, breakdown: LoadBreakdown): string[] {
  const alerts: string[] = [];

  if (breakdown.trRequired > 20) {
    alerts.push('High tonnage detected. Consider zoning or parallel equipment strategy.');
  }

  if (inputs.indoorTempC >= inputs.outdoorTempC) {
    alerts.push('Indoor setpoint should be below outdoor dry bulb for cooling mode validity.');
  }

  if (inputs.occupants / Math.max(1, inputs.areaM2) > 0.35) {
    alerts.push('High occupant density may require dedicated ventilation strategy.');
  }

  return alerts;
}

export function calculateLoadScenario(
  inputs: LoadCalculationInputs,
  overrides: ManualOverrides,
): LoadCalculationResult {
  const breakdown = calculateBreakdown(inputs, overrides);
  const equipmentOptions = buildEquipmentOptions(breakdown.trRequired);
  const airflowMap = buildAirflowMap(breakdown.cfmRequired);
  const formulas = buildFormulas(inputs, breakdown);
  const alerts = buildAlerts(inputs, breakdown);

  return {
    breakdown,
    equipmentOptions,
    airflowMap,
    formulas,
    alerts,
  };
}

export const defaultLoadInputs: LoadCalculationInputs = {
  projectName: 'HQ Office Fitout',
  spaceType: 'office',
  areaM2: 120,
  ceilingHeightM: 3,
  occupants: 22,
  outdoorTempC: 34,
  indoorTempC: 24,
  lightingWPerM2: 12,
  equipmentLoadW: 6800,
  ventilationCfmPerPerson: 15,
  safetyFactor: 1.1,
  diversityFactor: 0.95,
  supplyDeltaTF: 20,
};

export const defaultOverrides: ManualOverrides = {
  useManualTotalBtu: false,
  manualTotalBtu: null,
  useManualCfm: false,
  manualCfm: null,
};
