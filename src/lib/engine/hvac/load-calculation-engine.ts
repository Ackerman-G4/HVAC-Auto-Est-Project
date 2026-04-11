import {
  getRuleSetSync,
  lookupFromRuleSet,
  constantFromRuleSet,
  evaluateFromRuleSet,
} from '@/lib/engine/rules';
import { humidityRatio } from '@/lib/functions/psychrometric';

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
  peopleSensibleBtu: number;
  peopleLatentBtu: number;
  lightingBtu: number;
  equipmentBtu: number;
  ventilationSensibleBtu: number;
  ventilationLatentBtu: number;
  totalSensibleBtu: number;
  totalLatentBtu: number;
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

// ─── Rules-driven constants ───────────────────────────────────────
function getLoadRules() {
  return getRuleSetSync('cooling_load');
}

function getEnvelopeFactor(spaceType: SpaceType): number {
  try {
    return lookupFromRuleSet(getLoadRules(), 'envelope_btu_per_m2', spaceType);
  } catch {
    return 120; // safe default
  }
}

function getConstant(name: string): number {
  return constantFromRuleSet(getLoadRules(), 'cooling_load_constants', name);
}

const PEOPLE_BTU_PER_PERSON = () => getConstant('people_btu_per_person');
const WATT_TO_BTU_PER_HR = () => getConstant('watt_to_btu_per_hr');
const CFM_CONSTANT = () => getConstant('cfm_constant');
const BTU_PER_TR = () => getConstant('btu_per_tr');

/** Get per-person latent heat gain in W from rules (space-type aware) */
function getPeopleLatentW(spaceType: SpaceType): number {
  try {
    return lookupFromRuleSet(getLoadRules(), 'heat_gain_per_person', spaceType as string, 'latent');
  } catch {
    return 55; // ASHRAE default for office
  }
}

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

/** Convert a Celsius temperature DIFFERENCE to Fahrenheit difference (no +32 offset). */
function celsiusDeltaToFahrenheit(deltaC: number) {
  return deltaC * 1.8;
}

function calculateBreakdown(inputs: LoadCalculationInputs, overrides: ManualOverrides): LoadBreakdown {
  const rules = getLoadRules();
  const cfmConst = CFM_CONSTANT();
  const wattToBtu = WATT_TO_BTU_PER_HR();
  const peopleBtuPP = PEOPLE_BTU_PER_PERSON();
  const btuPerTr = BTU_PER_TR();

  // Input validation
  if (inputs.areaM2 <= 0) throw new Error('Floor area must be positive');
  if (inputs.occupants < 0) throw new Error('Occupants cannot be negative');
  if (inputs.ceilingHeightM <= 0) throw new Error('Ceiling height must be positive');

  const deltaTF = Math.max(1, celsiusDeltaToFahrenheit(inputs.outdoorTempC - inputs.indoorTempC));

  // ── Sensible loads ──────────────────────────────────────────────
  const envelopeBtu = evaluateFromRuleSet(rules, 'envelope_load_formula', {
    area: inputs.areaM2,
    factor: getEnvelopeFactor(inputs.spaceType),
  }).value;
  const peopleSensibleBtu = evaluateFromRuleSet(rules, 'people_load_formula', {
    occupants: inputs.occupants,
    btu_per_person: peopleBtuPP,
  }).value;
  const lightingBtu = evaluateFromRuleSet(rules, 'lighting_load_formula', {
    area: inputs.areaM2,
    density: inputs.lightingWPerM2,
    watt_to_btu: wattToBtu,
  }).value;
  const equipmentBtu = evaluateFromRuleSet(rules, 'equipment_load_formula', {
    watts: inputs.equipmentLoadW,
    watt_to_btu: wattToBtu,
  }).value;
  const ventilationCfm = inputs.occupants * inputs.ventilationCfmPerPerson;
  const ventilationSensibleBtu = evaluateFromRuleSet(rules, 'ventilation_sensible_formula', {
    cfm_constant: cfmConst,
    cfm: ventilationCfm,
    delta_t: deltaTF,
  }).value;

  // ── Latent loads ────────────────────────────────────────────────
  // People latent: occupants × latent W/person × W→BTU conversion
  const peopleLatentW = getPeopleLatentW(inputs.spaceType);
  const peopleLatentBtu = inputs.occupants * peopleLatentW * wattToBtu;

  // Ventilation latent: 0.68 × CFM × ΔW × 7000
  // ΔW = outdoor humidity ratio - indoor humidity ratio (grains/lb)
  const outdoorW = humidityRatio(inputs.outdoorTempC, 70); // assume 70% outdoor RH for Philippines
  const indoorW = humidityRatio(inputs.indoorTempC, 50);   // assume 50% indoor design RH
  const deltaW = Math.max(0, outdoorW - indoorW); // kg/kg
  const ventilationLatentBtu = evaluateFromRuleSet(rules, 'ventilation_latent_formula', {
    cfm: ventilationCfm,
    delta_w: deltaW,
  }).value;

  // ── Totals ──────────────────────────────────────────────────────
  const totalSensibleBtu = envelopeBtu + peopleSensibleBtu + lightingBtu + equipmentBtu + ventilationSensibleBtu;
  const totalLatentBtu = peopleLatentBtu + ventilationLatentBtu;
  const totalBtuBeforeFactors = totalSensibleBtu + totalLatentBtu;

  const adjustedByFactor = evaluateFromRuleSet(rules, 'design_load_formula', {
    raw_total: totalBtuBeforeFactors,
    safety_factor: inputs.safetyFactor,
    diversity_factor: inputs.diversityFactor,
  }).value;
  const totalBtuAfterFactors = overrides.useManualTotalBtu && overrides.manualTotalBtu
    ? overrides.manualTotalBtu
    : adjustedByFactor;

  const trRequired = totalBtuAfterFactors / btuPerTr;
  const computedCfm = evaluateFromRuleSet(rules, 'cfm_from_btu_formula', {
    total_btu: totalBtuAfterFactors,
    cfm_constant: cfmConst,
    supply_delta_t: Math.max(1, inputs.supplyDeltaTF),
  }).value;
  const cfmRequired = overrides.useManualCfm && overrides.manualCfm ? overrides.manualCfm : computedCfm;

  return {
    envelopeBtu: round(envelopeBtu),
    peopleSensibleBtu: round(peopleSensibleBtu),
    peopleLatentBtu: round(peopleLatentBtu),
    lightingBtu: round(lightingBtu),
    equipmentBtu: round(equipmentBtu),
    ventilationSensibleBtu: round(ventilationSensibleBtu),
    ventilationLatentBtu: round(ventilationLatentBtu),
    totalSensibleBtu: round(totalSensibleBtu),
    totalLatentBtu: round(totalLatentBtu),
    totalBtuBeforeFactors: round(totalBtuBeforeFactors),
    totalBtuAfterFactors: round(totalBtuAfterFactors),
    trRequired: round(trRequired),
    cfmRequired: round(cfmRequired),
  };
}

function buildEquipmentOptions(trRequired: number): EquipmentOption[] {
  const operatingHours = 3200; // annual operating hours — matches equipment-selection-engine default
  return CATALOG.map((item) => {
    const quantity = Math.max(1, Math.ceil(trRequired / item.capacityTr));
    const providedTr = quantity * item.capacityTr;
    const utilization = clamp((trRequired / Math.max(0.1, providedTr)) * 100, 0, 160);
    const annualEnergyKwh = (providedTr * 12000 * operatingHours) / (item.efficiencyEer * 1000);

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
  const deltaTF = Math.max(1, celsiusDeltaToFahrenheit(inputs.outdoorTempC - inputs.indoorTempC));
  const envelopeFactor = getEnvelopeFactor(inputs.spaceType);

  return [
    {
      label: 'Envelope Load',
      expression: 'Envelope BTU = Area x Space Factor',
      value: `${inputs.areaM2} x ${envelopeFactor} = ${breakdown.envelopeBtu.toLocaleString()} BTU/h`,
    },
    {
      label: 'Lighting Load',
      expression: 'Lighting BTU = Area x Lighting Density x 3.412',
      value: `${inputs.areaM2} x ${inputs.lightingWPerM2} x 3.412 = ${breakdown.lightingBtu.toLocaleString()} BTU/h`,
    },
    {
      label: 'Ventilation Sensible',
      expression: 'Vent Sensible = 1.08 x CFM x ΔT(°F)',
      value: `1.08 x ${airflow.toFixed(1)} x ${deltaTF.toFixed(1)} = ${breakdown.ventilationSensibleBtu.toLocaleString()} BTU/h`,
    },
    {
      label: 'Ventilation Latent',
      expression: 'Vent Latent = 0.68 x CFM x ΔW x 7000',
      value: `${breakdown.ventilationLatentBtu.toLocaleString()} BTU/h`,
    },
    {
      label: 'People Latent',
      expression: 'People Latent = Occupants x Latent W/person x 3.412',
      value: `${breakdown.peopleLatentBtu.toLocaleString()} BTU/h`,
    },
    {
      label: 'Total Sensible',
      expression: 'Sensible = Envelope + People + Lighting + Equipment + Vent Sensible',
      value: `${breakdown.totalSensibleBtu.toLocaleString()} BTU/h`,
    },
    {
      label: 'Total Latent',
      expression: 'Latent = People Latent + Ventilation Latent',
      value: `${breakdown.totalLatentBtu.toLocaleString()} BTU/h`,
    },
    {
      label: 'Design Load',
      expression: 'Design BTU = (Sensible + Latent) x Safety x Diversity',
      value: `${breakdown.totalBtuBeforeFactors.toLocaleString()} x ${inputs.safetyFactor} x ${inputs.diversityFactor} = ${breakdown.totalBtuAfterFactors.toLocaleString()} BTU/h`,
    },
    {
      label: 'Airflow Requirement',
      expression: 'CFM = BTU / (1.08 x Supply ΔT(°F))',
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
