/**
 * Pipe Sizing Engine
 * Refrigerant pipe, chilled water pipe, condensate drain sizing
 * Per Philippine Mechanical Engineering Code & ASHRAE standards
 */

export interface RefrigerantPipeInput {
  capacityBTU: number;
  refrigerantType: 'R410A' | 'R32' | 'R22' | 'R134a';
  lineLength: number;    // meters
  elevationDiff: number; // meters (positive = outdoor unit higher)
  isVRF?: boolean;
}

export interface RefrigerantPipeResult {
  liquidLine: { diameter: string; odMM: number; insulationMM: number };
  suctionLine: { diameter: string; odMM: number; insulationMM: number };
  maxLineLength: number;
  actualLineLength: number;
  refrigerantCharge: number; // grams additional
  braze: { joints: number; rodKg: number };
  insulationType: string;
  notes: string[];
}

export interface ChilledWaterPipeInput {
  capacityTR: number;
  deltaT: number; // °C
  pipeLength: number; // meters
}

export interface ChilledWaterPipeResult {
  flowRateLPS: number;
  pipeDiameter: string;
  pipeSchedule: string;
  insulationMM: number;
  velocityMPS: number;
}

export interface CondensatePipeResult {
  pipeDiameter: string;
  material: string;
  slopePercent: number;
  trapRequired: boolean;
}

/** Refrigerant pipe sizing table (BTU → pipe OD in mm) */
const REFRIGERANT_PIPE_TABLE: Record<string, { maxBTU: number; liquid: number; suction: number }[]> = {
  R410A: [
    { maxBTU: 9000, liquid: 6.35, suction: 9.53 },
    { maxBTU: 12000, liquid: 6.35, suction: 12.70 },
    { maxBTU: 18000, liquid: 6.35, suction: 12.70 },
    { maxBTU: 24000, liquid: 9.53, suction: 15.88 },
    { maxBTU: 36000, liquid: 9.53, suction: 15.88 },
    { maxBTU: 48000, liquid: 9.53, suction: 19.05 },
    { maxBTU: 60000, liquid: 12.70, suction: 22.23 },
    { maxBTU: 96000, liquid: 12.70, suction: 28.58 },
    { maxBTU: 120000, liquid: 15.88, suction: 28.58 },
    { maxBTU: 180000, liquid: 19.05, suction: 34.93 },
    { maxBTU: 240000, liquid: 22.23, suction: 41.28 },
  ],
  R32: [
    { maxBTU: 9000, liquid: 6.35, suction: 9.53 },
    { maxBTU: 12000, liquid: 6.35, suction: 12.70 },
    { maxBTU: 18000, liquid: 6.35, suction: 12.70 },
    { maxBTU: 24000, liquid: 9.53, suction: 15.88 },
    { maxBTU: 36000, liquid: 9.53, suction: 15.88 },
    { maxBTU: 48000, liquid: 9.53, suction: 19.05 },
    { maxBTU: 60000, liquid: 12.70, suction: 22.23 },
    { maxBTU: 96000, liquid: 12.70, suction: 28.58 },
    { maxBTU: 120000, liquid: 15.88, suction: 28.58 },
    { maxBTU: 180000, liquid: 19.05, suction: 34.93 },
    { maxBTU: 240000, liquid: 22.23, suction: 41.28 },
  ],
  R22: [
    { maxBTU: 9000, liquid: 6.35, suction: 12.70 },
    { maxBTU: 12000, liquid: 6.35, suction: 12.70 },
    { maxBTU: 18000, liquid: 9.53, suction: 15.88 },
    { maxBTU: 24000, liquid: 9.53, suction: 15.88 },
    { maxBTU: 36000, liquid: 9.53, suction: 19.05 },
    { maxBTU: 48000, liquid: 12.70, suction: 22.23 },
    { maxBTU: 60000, liquid: 12.70, suction: 28.58 },
    { maxBTU: 96000, liquid: 15.88, suction: 28.58 },
    { maxBTU: 120000, liquid: 15.88, suction: 34.93 },
  ],
  R134a: [
    { maxBTU: 12000, liquid: 9.53, suction: 15.88 },
    { maxBTU: 24000, liquid: 9.53, suction: 19.05 },
    { maxBTU: 48000, liquid: 12.70, suction: 22.23 },
    { maxBTU: 60000, liquid: 12.70, suction: 28.58 },
    { maxBTU: 96000, liquid: 15.88, suction: 34.93 },
  ],
};

function formatPipeDiameter(od: number): string {
  const map: Record<number, string> = {
    6.35: '1/4"',
    9.53: '3/8"',
    12.70: '1/2"',
    15.88: '5/8"',
    19.05: '3/4"',
    22.23: '7/8"',
    25.40: '1"',
    28.58: '1-1/8"',
    34.93: '1-3/8"',
    41.28: '1-5/8"',
  };
  return map[od] || `${od}mm`;
}

/**
 * Size refrigerant piping
 */
export function sizeRefrigerantPipe(input: RefrigerantPipeInput): RefrigerantPipeResult {
  const table = REFRIGERANT_PIPE_TABLE[input.refrigerantType] || REFRIGERANT_PIPE_TABLE['R410A'];
  const notes: string[] = [];

  // Find matching row
  const row = table.find((r) => input.capacityBTU <= r.maxBTU)
    || table[table.length - 1];

  // Max line length depends on type
  const maxLength = input.isVRF ? 100 : 30; // meters

  if (input.lineLength > maxLength) {
    notes.push(`Line length ${input.lineLength}m exceeds max ${maxLength}m. Consider upsizing or relocating outdoor unit.`);
  }

  if (input.elevationDiff > 20) {
    notes.push('Elevation difference >20m. Oil return loop recommended on suction line.');
  }

  // Additional refrigerant charge for long runs
  // R410A: ~30g per meter of 1/4" liquid line, proportional to diameter
  const chargePerMeter = (row.liquid / 6.35) * 30;
  const additionalCharge = Math.round(chargePerMeter * Math.max(0, input.lineLength - 5));

  // Braze joints estimate
  const joints = Math.ceil(input.lineLength / 4) * 2 + 6; // every 4m + connections
  const rodKg = joints * 0.015; // ~15g per joint

  // Insulation
  const suctionInsulation = row.suction <= 15.88 ? 10 : row.suction <= 22.23 ? 13 : 19;
  const liquidInsulation = row.liquid <= 9.53 ? 10 : 13;

  return {
    liquidLine: {
      diameter: formatPipeDiameter(row.liquid),
      odMM: row.liquid,
      insulationMM: liquidInsulation,
    },
    suctionLine: {
      diameter: formatPipeDiameter(row.suction),
      odMM: row.suction,
      insulationMM: suctionInsulation,
    },
    maxLineLength: maxLength,
    actualLineLength: input.lineLength,
    refrigerantCharge: additionalCharge,
    braze: { joints, rodKg: Math.round(rodKg * 100) / 100 },
    insulationType: 'Armaflex closed-cell rubber',
    notes,
  };
}

/**
 * Size chilled water piping
 */
export function sizeChilledWaterPipe(input: ChilledWaterPipeInput): ChilledWaterPipeResult {
  // Flow rate: Q = capacity / (500 × ΔT) in GPM (imperial)
  // 1 TR = 12,000 BTU/h
  const btuPerHour = input.capacityTR * 12000;
  const gpm = btuPerHour / (500 * (input.deltaT * 1.8));
  const lps = gpm * 0.0631;

  // Pipe diameter from flow rate (target velocity 1.5-3.0 m/s)
  const targetVelocity = 2.0; // m/s
  const areaSqM = lps / 1000 / targetVelocity;
  const diameterM = Math.sqrt(areaSqM * 4 / Math.PI);
  const diameterMM = diameterM * 1000;

  // Standard pipe sizes
  const standardPipes = [
    { label: '3/4"', mm: 19 },
    { label: '1"', mm: 25 },
    { label: '1-1/4"', mm: 32 },
    { label: '1-1/2"', mm: 40 },
    { label: '2"', mm: 50 },
    { label: '2-1/2"', mm: 65 },
    { label: '3"', mm: 80 },
    { label: '4"', mm: 100 },
    { label: '5"', mm: 125 },
    { label: '6"', mm: 150 },
    { label: '8"', mm: 200 },
  ];

  const selected = standardPipes.find((p) => p.mm >= diameterMM)
    || standardPipes[standardPipes.length - 1];

  const actualAreaSqM = Math.PI * Math.pow(selected.mm / 2000, 2);
  const actualVelocity = (lps / 1000) / actualAreaSqM;

  return {
    flowRateLPS: Math.round(lps * 100) / 100,
    pipeDiameter: selected.label,
    pipeSchedule: 'Schedule 40',
    insulationMM: 25,
    velocityMPS: Math.round(actualVelocity * 100) / 100,
  };
}

/**
 * Size condensate drain pipe
 */
export function sizeCondensatePipe(capacityTR: number): CondensatePipeResult {
  let diameter: string;
  if (capacityTR <= 5) diameter = '3/4" (20mm)';
  else if (capacityTR <= 10) diameter = '1" (25mm)';
  else if (capacityTR <= 20) diameter = '1-1/4" (32mm)';
  else diameter = '1-1/2" (40mm)';

  return {
    pipeDiameter: diameter,
    material: 'PVC Schedule 40',
    slopePercent: 1, // 1% minimum slope (1:100)
    trapRequired: true,
  };
}
