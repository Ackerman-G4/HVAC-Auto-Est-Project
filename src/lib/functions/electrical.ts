/**
 * Electrical Sizing Engine
 * Cable sizing, breaker sizing, panel schedule
 * Per Philippine Electrical Code (PEC)
 */

export interface ElectricalInput {
  equipmentPowerKW: number;
  voltage: number;         // 220 or 380
  phase: 1 | 3;
  powerFactor: number;     // typically 0.85-0.95
  runLength: number;       // meters
  ambientTemp: number;     // °C
  conduitType: 'PVC' | 'EMT' | 'RSC';
}

export interface ElectricalResult {
  fla: number;              // Full Load Ampere
  mca: number;              // Minimum Circuit Ampacity
  mopd: number;             // Maximum Overcurrent Protection Device
  wireSize: string;         // mm² 
  wireSizeAWG: string;      // AWG equivalent
  wireType: string;         // THHN, etc.
  groundWire: string;       // mm²
  conduitSize: string;      // mm
  breakerSize: number;      // Amperes
  breakerPoles: number;
  voltageDropPercent: number;
  notes: string[];
}

/** Standard breaker sizes (Amperes) */
const STANDARD_BREAKERS = [15, 20, 25, 30, 40, 50, 60, 70, 80, 100, 125, 150, 175, 200, 225, 250, 300, 350, 400];

/** Wire ampacity table (THHN in PVC conduit at 30°C) */
const WIRE_AMPACITY: { sqmm: number; awg: string; ampacity30C: number }[] = [
  { sqmm: 2.0, awg: '14 AWG', ampacity30C: 20 },
  { sqmm: 3.5, awg: '12 AWG', ampacity30C: 25 },
  { sqmm: 5.5, awg: '10 AWG', ampacity30C: 35 },
  { sqmm: 8.0, awg: '8 AWG', ampacity30C: 50 },
  { sqmm: 14, awg: '6 AWG', ampacity30C: 65 },
  { sqmm: 22, awg: '4 AWG', ampacity30C: 85 },
  { sqmm: 30, awg: '3 AWG', ampacity30C: 100 },
  { sqmm: 38, awg: '2 AWG', ampacity30C: 115 },
  { sqmm: 50, awg: '1 AWG', ampacity30C: 130 },
  { sqmm: 60, awg: '1/0 AWG', ampacity30C: 150 },
  { sqmm: 80, awg: '2/0 AWG', ampacity30C: 175 },
  { sqmm: 100, awg: '3/0 AWG', ampacity30C: 200 },
  { sqmm: 125, awg: '4/0 AWG', ampacity30C: 230 },
  { sqmm: 150, awg: '250 MCM', ampacity30C: 255 },
  { sqmm: 200, awg: '350 MCM', ampacity30C: 310 },
  { sqmm: 250, awg: '500 MCM', ampacity30C: 380 },
];

/** Temperature derating factors */
function tempDerating(ambientTemp: number): number {
  if (ambientTemp <= 30) return 1.00;
  if (ambientTemp <= 35) return 0.94;
  if (ambientTemp <= 40) return 0.87;
  if (ambientTemp <= 45) return 0.79;
  if (ambientTemp <= 50) return 0.71;
  return 0.61;
}

/** Conduit sizes for wire count */
const CONDUIT_SIZES: { maxWires: number; size: string }[] = [
  { maxWires: 3, size: '20mm (3/4")' },
  { maxWires: 4, size: '25mm (1")' },
  { maxWires: 6, size: '32mm (1-1/4")' },
  { maxWires: 9, size: '40mm (1-1/2")' },
  { maxWires: 12, size: '50mm (2")' },
  { maxWires: 20, size: '63mm (2-1/2")' },
];

/** Calculate voltage drop */
function calcVoltageDrop(
  current: number,
  length: number,
  wireSqMM: number,
  voltage: number,
  phase: number
): number {
  // Resistivity of copper at 75°C = 0.0214 Ω·mm²/m
  const resistivity = 0.0214;
  const resistance = (resistivity * length * 2) / wireSqMM; // round trip
  const factor = phase === 3 ? Math.sqrt(3) : 2;
  const vDrop = current * resistance;
  return (vDrop / voltage) * 100;
}

/**
 * Main electrical sizing function
 */
export function sizeElectrical(input: ElectricalInput): ElectricalResult {
  const notes: string[] = [];
  const { equipmentPowerKW, voltage, phase, powerFactor, runLength } = input;

  // Full Load Ampere
  let fla: number;
  if (phase === 3) {
    fla = (equipmentPowerKW * 1000) / (Math.sqrt(3) * voltage * powerFactor);
  } else {
    fla = (equipmentPowerKW * 1000) / (voltage * powerFactor);
  }

  // Minimum Circuit Ampacity = 125% of FLA (motor loads)
  const mca = fla * 1.25;

  // Maximum Overcurrent Protection Device = 175% of FLA for hermetic motors
  const mopd = fla * 1.75;

  // Select breaker (next standard size >= MOPD, but not more than 175%)
  let breakerSize = STANDARD_BREAKERS.find((b) => b >= mopd) || STANDARD_BREAKERS[STANDARD_BREAKERS.length - 1];
  
  // Ensure breaker is reasonable
  if (breakerSize > fla * 2.5) {
    breakerSize = STANDARD_BREAKERS.find((b) => b >= mca) || breakerSize;
    notes.push('Breaker sized at 125% FLA (MCA) instead of 175% MOPD.');
  }

  // Temperature derating
  const derating = tempDerating(input.ambientTemp);

  // Select wire size
  const requiredAmpacity = mca / derating;
  const selectedWire = WIRE_AMPACITY.find((w) => w.ampacity30C >= requiredAmpacity)
    || WIRE_AMPACITY[WIRE_AMPACITY.length - 1];

  // Voltage drop check
  const vDrop = calcVoltageDrop(fla, runLength, selectedWire.sqmm, voltage, phase);
  
  let finalWire = selectedWire;
  if (vDrop > 3) {
    // Upsize wire for voltage drop
    const upsizedIdx = WIRE_AMPACITY.indexOf(selectedWire);
    for (let i = upsizedIdx + 1; i < WIRE_AMPACITY.length; i++) {
      const newVDrop = calcVoltageDrop(fla, runLength, WIRE_AMPACITY[i].sqmm, voltage, phase);
      if (newVDrop <= 3) {
        finalWire = WIRE_AMPACITY[i];
        notes.push(`Wire upsized from ${selectedWire.sqmm}mm² to ${finalWire.sqmm}mm² for voltage drop.`);
        break;
      }
    }
  }

  const finalVDrop = calcVoltageDrop(fla, runLength, finalWire.sqmm, voltage, phase);

  // Ground wire (per PEC Table 2.50.1)
  let groundWire: string;
  if (breakerSize <= 20) groundWire = '3.5mm²';
  else if (breakerSize <= 60) groundWire = '5.5mm²';
  else if (breakerSize <= 100) groundWire = '8.0mm²';
  else if (breakerSize <= 200) groundWire = '14mm²';
  else groundWire = '22mm²';

  // Conduit size
  const wireCount = phase === 3 ? 5 : 3; // L1,L2,L3,N,G or L,N,G
  const conduit = CONDUIT_SIZES.find((c) => c.maxWires >= wireCount) || CONDUIT_SIZES[CONDUIT_SIZES.length - 1];

  // PEC compliance notes
  if (finalVDrop > 3) {
    notes.push(`WARNING: Voltage drop ${finalVDrop.toFixed(1)}% exceeds PEC 3% limit.`);
  }
  if (runLength > 50) {
    notes.push('Long run — verify conduit fill and consider busway for >100A.');
  }

  return {
    fla: Math.round(fla * 100) / 100,
    mca: Math.round(mca * 100) / 100,
    mopd: Math.round(mopd * 100) / 100,
    wireSize: `${finalWire.sqmm}mm²`,
    wireSizeAWG: finalWire.awg,
    wireType: 'THHN',
    groundWire,
    conduitSize: conduit.size,
    breakerSize,
    breakerPoles: phase === 3 ? 3 : (voltage > 230 ? 2 : 1),
    voltageDropPercent: Math.round(finalVDrop * 100) / 100,
    notes,
  };
}

/**
 * Generate panel schedule for multiple equipment
 */
export interface PanelScheduleEntry {
  circuit: number;
  description: string;
  breakerSize: number;
  poles: number;
  wireSize: string;
  fla: number;
}

export function generatePanelSchedule(
  equipment: { name: string; powerKW: number; voltage: number; phase: 1 | 3 }[]
): {
  entries: PanelScheduleEntry[];
  totalConnectedKW: number;
  totalDemandKW: number;
  mainBreakerSize: number;
  panelSize: string;
} {
  const entries: PanelScheduleEntry[] = [];
  let totalKW = 0;
  let circuitNum = 1;

  for (const eq of equipment) {
    const result = sizeElectrical({
      equipmentPowerKW: eq.powerKW,
      voltage: eq.voltage,
      phase: eq.phase,
      powerFactor: 0.90,
      runLength: 15,
      ambientTemp: 35,
      conduitType: 'PVC',
    });

    entries.push({
      circuit: circuitNum,
      description: eq.name,
      breakerSize: result.breakerSize,
      poles: result.breakerPoles,
      wireSize: result.wireSize,
      fla: result.fla,
    });

    totalKW += eq.powerKW;
    circuitNum += result.breakerPoles;
  }

  // Demand factor for HVAC: 100% (no demand reduction)
  const demandKW = totalKW * 1.0;
  
  // Main breaker
  const mainFLA = (demandKW * 1000) / (Math.sqrt(3) * 380 * 0.9);
  const mainBreaker = STANDARD_BREAKERS.find((b) => b >= mainFLA * 1.25) 
    || STANDARD_BREAKERS[STANDARD_BREAKERS.length - 1];

  // Panel size
  let panelSize: string;
  if (circuitNum <= 12) panelSize = '12-way';
  else if (circuitNum <= 24) panelSize = '24-way';
  else if (circuitNum <= 36) panelSize = '36-way';
  else panelSize = '42-way';

  return {
    entries,
    totalConnectedKW: Math.round(totalKW * 100) / 100,
    totalDemandKW: Math.round(demandKW * 100) / 100,
    mainBreakerSize: mainBreaker,
    panelSize,
  };
}
