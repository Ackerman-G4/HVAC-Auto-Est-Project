/**
 * Calibration Engine for CFD Simulation
 *
 * Provides:
 * - Estimated vs CFD comparison at tile/rack/HVAC locations
 * - Nelder-Mead auto-adjustment of 5 calibration coefficients
 * - Sensor-based calibration using real measurement data
 */

import type {
  SimulationInput,
  SimulationResult,
  CalibrationCoefficients,
  CalibrationPoint,
  CalibrationResult,
  CalibrationConfig,
  SensorReading,
  Vec3,
  PerforatedTile,
  ServerRack,
  SimulationConfig,
} from '@/types/simulation';
import { DEFAULT_CALIBRATION_COEFFICIENTS } from '@/types/simulation';
import { runCFDSimulation, DEFAULT_CONFIG } from './cfd-simulation';

// ─── Estimated Airflow (Analytical) ─────────────────────────────

interface EstimatedPoint {
  location: Vec3;
  fieldType: 'temperature' | 'velocity' | 'humidity';
  estimatedValue: number;
}

/** Analytical estimate of tile discharge velocity using Bernoulli equation */
function estimateTileVelocity(tile: PerforatedTile, config: SimulationConfig): number {
  const deltaP = 10; // Pa — matches cfd-simulation.ts default
  const correctionFactor = 1.6;
  const baseVelocity = Math.sqrt((2 * deltaP) / config.airDensity);
  return correctionFactor * baseVelocity * tile.openArea;
}

/** Analytical estimate of supply temperature at tile */
function estimateTileTemperature(config: SimulationConfig): number {
  const plenumTempOffset = 5; // matches cfd-simulation.ts default
  return config.ambientTempC - plenumTempOffset;
}

/** Analytical heat rise estimate at rack inlet based on heat balance */
function estimateRackInletTemp(rack: ServerRack, totalSupplyCFM: number, config: SimulationConfig): number {
  const cfmToM3s = 0.0004719;
  const totalFlowM3s = totalSupplyCFM * cfmToM3s;
  const massFlow = Math.max(totalFlowM3s * config.airDensity, 0.01);
  const heatW = rack.powerKW * 1000;
  // Simple heat balance: ΔT = Q / (ṁ · cp) distributed proportionally
  const deltaT = heatW / (massFlow * config.specificHeat);
  return config.ambientTempC + deltaT * 0.3; // rack inlet gets ~30% of heat rise (rest via return)
}

export function computeEstimatedPoints(
  input: SimulationInput,
): EstimatedPoint[] {
  const config: SimulationConfig = { ...DEFAULT_CONFIG, ...input.config };
  const points: EstimatedPoint[] = [];

  const totalCFM = input.hvacUnits
    .filter((u) => u.status !== 'failed')
    .reduce((sum, u) => sum + u.airflowCFM, 0);

  // Tile velocity estimates
  for (const tile of input.tiles) {
    points.push({
      location: { x: tile.x * config.gridResolution, y: tile.y * config.gridResolution, z: 0 },
      fieldType: 'velocity',
      estimatedValue: estimateTileVelocity(tile, config),
    });
    points.push({
      location: { x: tile.x * config.gridResolution, y: tile.y * config.gridResolution, z: 0 },
      fieldType: 'temperature',
      estimatedValue: estimateTileTemperature(config),
    });
  }

  // Rack inlet temperature estimates
  for (const rack of input.racks) {
    points.push({
      location: rack.position,
      fieldType: 'temperature',
      estimatedValue: estimateRackInletTemp(rack, totalCFM, config),
    });
  }

  return points;
}

// ─── CFD Field Sampling ─────────────────────────────────────────

function sampleCFDField(
  result: SimulationResult,
  config: SimulationConfig,
  location: Vec3,
  fieldType: 'temperature' | 'velocity' | 'humidity',
): number {
  const gx = Math.min(Math.floor(location.x / config.gridResolution), config.gridSizeX - 1);
  const gy = Math.min(Math.floor(location.y / config.gridResolution), config.gridSizeY - 1);
  const gz = Math.min(Math.floor(location.z / config.gridResolution), config.gridSizeZ - 1);
  const cx = Math.max(0, gx);
  const cy = Math.max(0, gy);
  const cz = Math.max(0, gz);

  switch (fieldType) {
    case 'temperature':
      return result.temperatureField[cx]?.[cy]?.[cz] ?? config.ambientTempC;
    case 'velocity': {
      const v = result.velocityField[cx]?.[cy]?.[cz];
      if (!v) return 0;
      return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    }
    case 'humidity':
      return result.humidityField[cx]?.[cy]?.[cz] ?? config.ambientHumidityRatio;
  }
}

// ─── Compare Estimated vs CFD ───────────────────────────────────

export function compareEstimatedVsCFD(
  input: SimulationInput,
  cfdResult: SimulationResult,
): CalibrationPoint[] {
  const config: SimulationConfig = { ...DEFAULT_CONFIG, ...input.config };
  const estimated = computeEstimatedPoints(input);
  const points: CalibrationPoint[] = [];

  for (const ep of estimated) {
    const simulated = sampleCFDField(cfdResult, config, ep.location, ep.fieldType);
    const deviationAbs = Math.abs(simulated - ep.estimatedValue);
    const deviationPct =
      Math.abs(ep.estimatedValue) > 1e-6
        ? (deviationAbs / Math.abs(ep.estimatedValue)) * 100
        : deviationAbs * 100;

    points.push({
      location: ep.location,
      fieldType: ep.fieldType,
      simulatedValue: simulated,
      referenceValue: ep.estimatedValue,
      deviationPct,
      deviationAbs,
    });
  }

  return points;
}

// ─── Compare Sensors vs CFD ─────────────────────────────────────

function compareSensorsVsCFD(
  sensors: SensorReading[],
  cfdResult: SimulationResult,
  config: SimulationConfig,
): CalibrationPoint[] {
  const points: CalibrationPoint[] = [];

  for (const sensor of sensors) {
    const simulated = sampleCFDField(cfdResult, config, sensor.position, sensor.type);
    const deviationAbs = Math.abs(simulated - sensor.measuredValue);
    const deviationPct =
      Math.abs(sensor.measuredValue) > 1e-6
        ? (deviationAbs / Math.abs(sensor.measuredValue)) * 100
        : deviationAbs * 100;

    points.push({
      location: sensor.position,
      fieldType: sensor.type,
      simulatedValue: simulated,
      referenceValue: sensor.measuredValue,
      deviationPct,
      deviationAbs,
    });
  }

  return points;
}

// ─── Aggregate Deviation ────────────────────────────────────────

function aggregateDeviation(points: CalibrationPoint[]): {
  temperature: number;
  velocity: number;
  humidity: number;
  overall: number;
} {
  const byType = { temperature: [] as number[], velocity: [] as number[], humidity: [] as number[] };
  for (const p of points) {
    byType[p.fieldType].push(p.deviationPct);
  }

  const mean = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  const temperature = mean(byType.temperature);
  const velocity = mean(byType.velocity);
  const humidity = mean(byType.humidity);
  const allDevs = points.map((p) => p.deviationPct);
  const overall = mean(allDevs);

  return { temperature, velocity, humidity, overall };
}

// ─── Nelder-Mead Simplex Optimizer ──────────────────────────────

type CoeffVector = [number, number, number, number, number];

function coeffsToVector(c: CalibrationCoefficients): CoeffVector {
  return [c.tileDischargeCoeff, c.thermalLossFactor, c.wallConductivity, c.plenumMixingFactor, c.turbulenceIntensityFactor];
}

function vectorToCoeffs(v: CoeffVector): CalibrationCoefficients {
  return {
    tileDischargeCoeff: Math.max(0.5, Math.min(2.0, v[0])),
    thermalLossFactor: Math.max(0.5, Math.min(2.0, v[1])),
    wallConductivity: Math.max(0, Math.min(5.0, v[2])),
    plenumMixingFactor: Math.max(0.5, Math.min(2.0, v[3])),
    turbulenceIntensityFactor: Math.max(0.5, Math.min(2.0, v[4])),
  };
}

function addVectors(a: CoeffVector, b: CoeffVector): CoeffVector {
  return a.map((v, i) => v + b[i]) as CoeffVector;
}

function scaleVector(a: CoeffVector, s: number): CoeffVector {
  return a.map((v) => v * s) as CoeffVector;
}

function subtractVectors(a: CoeffVector, b: CoeffVector): CoeffVector {
  return a.map((v, i) => v - b[i]) as CoeffVector;
}

/**
 * Run a partial (reduced-iteration) CFD and return mean deviation vs reference points.
 * This is the objective function for Nelder-Mead.
 */
function evaluateCoefficients(
  input: SimulationInput,
  coeffs: CalibrationCoefficients,
  referencePoints: CalibrationPoint[],
  calibrationIterations: number,
): number {
  const calibratedInput: SimulationInput = {
    ...input,
    config: { ...DEFAULT_CONFIG, ...input.config, iterations: calibrationIterations },
    calibration: { coefficients: coeffs },
  };

  const result = runCFDSimulation(calibratedInput);
  const config: SimulationConfig = { ...DEFAULT_CONFIG, ...input.config };

  let totalDev = 0;
  let count = 0;
  for (const ref of referencePoints) {
    const simulated = sampleCFDField(result, config, ref.location, ref.fieldType);
    const devAbs = Math.abs(simulated - ref.referenceValue);
    const devPct =
      Math.abs(ref.referenceValue) > 1e-6
        ? (devAbs / Math.abs(ref.referenceValue)) * 100
        : devAbs * 100;
    totalDev += devPct;
    count++;
  }

  return count > 0 ? totalDev / count : 0;
}

// ─── Auto-Calibration (Nelder-Mead) ────────────────────────────

export function autoCalibrate(
  input: SimulationInput,
  cfdResult: SimulationResult,
  calibrationConfig: CalibrationConfig,
): CalibrationResult {
  const referencePoints = compareEstimatedVsCFD(input, cfdResult);
  const convergenceHistory: number[] = [];
  const n = 5; // number of coefficients
  const reducedIterations = 30; // partial CFD runs

  // Initialize simplex: starting point + n perturbations
  const x0 = coeffsToVector(DEFAULT_CALIBRATION_COEFFICIENTS);
  const simplex: { point: CoeffVector; value: number }[] = [];

  const startValue = evaluateCoefficients(input, vectorToCoeffs(x0), referencePoints, reducedIterations);
  simplex.push({ point: x0, value: startValue });
  convergenceHistory.push(startValue);

  for (let i = 0; i < n; i++) {
    const p = [...x0] as CoeffVector;
    p[i] += i === 2 ? 0.5 : 0.1; // wallConductivity starts at 0, larger step
    const val = evaluateCoefficients(input, vectorToCoeffs(p), referencePoints, reducedIterations);
    simplex.push({ point: p, value: val });
  }

  const alpha = 1.0;  // reflection
  const gamma = 2.0;  // expansion
  const rhoNM = 0.5;  // contraction
  const sigma = 0.5;  // shrink

  for (let iter = 0; iter < calibrationConfig.maxIterations; iter++) {
    // Sort: best first
    simplex.sort((a, b) => a.value - b.value);

    const bestVal = simplex[0].value;
    convergenceHistory.push(bestVal);

    if (bestVal < calibrationConfig.targetDeviationPct) break;

    // Centroid of all points except worst
    const centroid = [0, 0, 0, 0, 0] as CoeffVector;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        centroid[j] += simplex[i].point[j];
      }
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    const worst = simplex[n];

    // Reflection
    const reflected = addVectors(centroid, scaleVector(subtractVectors(centroid, worst.point), alpha));
    const reflectedVal = evaluateCoefficients(input, vectorToCoeffs(reflected), referencePoints, reducedIterations);

    if (reflectedVal < simplex[0].value) {
      // Expansion
      const expanded = addVectors(centroid, scaleVector(subtractVectors(reflected, centroid), gamma));
      const expandedVal = evaluateCoefficients(input, vectorToCoeffs(expanded), referencePoints, reducedIterations);
      if (expandedVal < reflectedVal) {
        simplex[n] = { point: expanded, value: expandedVal };
      } else {
        simplex[n] = { point: reflected, value: reflectedVal };
      }
    } else if (reflectedVal < simplex[n - 1].value) {
      simplex[n] = { point: reflected, value: reflectedVal };
    } else {
      // Contraction
      const contracted = addVectors(centroid, scaleVector(subtractVectors(worst.point, centroid), rhoNM));
      const contractedVal = evaluateCoefficients(input, vectorToCoeffs(contracted), referencePoints, reducedIterations);
      if (contractedVal < worst.value) {
        simplex[n] = { point: contracted, value: contractedVal };
      } else {
        // Shrink toward best
        const best = simplex[0].point;
        for (let i = 1; i <= n; i++) {
          const shrunk = addVectors(best, scaleVector(subtractVectors(simplex[i].point, best), sigma));
          const shrunkVal = evaluateCoefficients(input, vectorToCoeffs(shrunk), referencePoints, reducedIterations);
          simplex[i] = { point: shrunk, value: shrunkVal };
        }
      }
    }
  }

  simplex.sort((a, b) => a.value - b.value);
  const bestCoeffs = vectorToCoeffs(simplex[0].point);

  // Final full comparison with best coefficients
  const finalInput: SimulationInput = {
    ...input,
    calibration: { coefficients: bestCoeffs },
  };
  const finalResult = runCFDSimulation(finalInput);
  const finalPoints = compareEstimatedVsCFD(finalInput, finalResult);
  const deviation = aggregateDeviation(finalPoints);

  return {
    id: crypto.randomUUID(),
    points: finalPoints,
    overallDeviationPct: {
      temperature: deviation.temperature,
      velocity: deviation.velocity,
      humidity: deviation.humidity,
    },
    adjustedCoefficients: bestCoeffs,
    convergenceHistory,
    iterations: convergenceHistory.length,
    sensorReadings: [],
    timestamp: new Date().toISOString(),
  };
}

// ─── Sensor-Based Calibration ───────────────────────────────────

export function calibrateWithSensors(
  input: SimulationInput,
  cfdResult: SimulationResult,
  sensors: SensorReading[],
  calibrationConfig: CalibrationConfig,
): CalibrationResult {
  const config: SimulationConfig = { ...DEFAULT_CONFIG, ...input.config };
  const sensorPoints = compareSensorsVsCFD(sensors, cfdResult, config);
  const convergenceHistory: number[] = [];
  const n = 5;
  const reducedIterations = 30;

  // Use sensor-based points as the reference for optimization
  const x0 = coeffsToVector(DEFAULT_CALIBRATION_COEFFICIENTS);
  const simplex: { point: CoeffVector; value: number }[] = [];

  const startValue = evaluateCoefficients(input, vectorToCoeffs(x0), sensorPoints, reducedIterations);
  simplex.push({ point: x0, value: startValue });
  convergenceHistory.push(startValue);

  for (let i = 0; i < n; i++) {
    const p = [...x0] as CoeffVector;
    p[i] += i === 2 ? 0.5 : 0.1;
    const val = evaluateCoefficients(input, vectorToCoeffs(p), sensorPoints, reducedIterations);
    simplex.push({ point: p, value: val });
  }

  const alpha = 1.0;
  const gamma = 2.0;
  const rhoNM = 0.5;
  const sigma = 0.5;

  for (let iter = 0; iter < calibrationConfig.maxIterations; iter++) {
    simplex.sort((a, b) => a.value - b.value);
    const bestVal = simplex[0].value;
    convergenceHistory.push(bestVal);

    if (bestVal < calibrationConfig.targetDeviationPct) break;

    const centroid = [0, 0, 0, 0, 0] as CoeffVector;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        centroid[j] += simplex[i].point[j];
      }
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    const worst = simplex[n];
    const reflected = addVectors(centroid, scaleVector(subtractVectors(centroid, worst.point), alpha));
    const reflectedVal = evaluateCoefficients(input, vectorToCoeffs(reflected), sensorPoints, reducedIterations);

    if (reflectedVal < simplex[0].value) {
      const expanded = addVectors(centroid, scaleVector(subtractVectors(reflected, centroid), gamma));
      const expandedVal = evaluateCoefficients(input, vectorToCoeffs(expanded), sensorPoints, reducedIterations);
      simplex[n] = expandedVal < reflectedVal
        ? { point: expanded, value: expandedVal }
        : { point: reflected, value: reflectedVal };
    } else if (reflectedVal < simplex[n - 1].value) {
      simplex[n] = { point: reflected, value: reflectedVal };
    } else {
      const contracted = addVectors(centroid, scaleVector(subtractVectors(worst.point, centroid), rhoNM));
      const contractedVal = evaluateCoefficients(input, vectorToCoeffs(contracted), sensorPoints, reducedIterations);
      if (contractedVal < worst.value) {
        simplex[n] = { point: contracted, value: contractedVal };
      } else {
        const best = simplex[0].point;
        for (let i = 1; i <= n; i++) {
          const shrunk = addVectors(best, scaleVector(subtractVectors(simplex[i].point, best), sigma));
          const shrunkVal = evaluateCoefficients(input, vectorToCoeffs(shrunk), sensorPoints, reducedIterations);
          simplex[i] = { point: shrunk, value: shrunkVal };
        }
      }
    }
  }

  simplex.sort((a, b) => a.value - b.value);
  const bestCoeffs = vectorToCoeffs(simplex[0].point);

  // Final full run with best coefficients
  const finalInput: SimulationInput = {
    ...input,
    calibration: { coefficients: bestCoeffs, sensorReadings: sensors },
  };
  const finalResult = runCFDSimulation(finalInput);
  const finalSensorPoints = compareSensorsVsCFD(sensors, finalResult, config);
  const deviation = aggregateDeviation(finalSensorPoints);

  return {
    id: crypto.randomUUID(),
    points: finalSensorPoints,
    overallDeviationPct: {
      temperature: deviation.temperature,
      velocity: deviation.velocity,
      humidity: deviation.humidity,
    },
    adjustedCoefficients: bestCoeffs,
    convergenceHistory,
    iterations: convergenceHistory.length,
    sensorReadings: sensors,
    timestamp: new Date().toISOString(),
  };
}

// ─── Compare-Only Mode (no optimization) ────────────────────────

export function compareOnly(
  input: SimulationInput,
  cfdResult: SimulationResult,
  sensors?: SensorReading[],
): CalibrationResult {
  const config: SimulationConfig = { ...DEFAULT_CONFIG, ...input.config };
  const estimatedPoints = compareEstimatedVsCFD(input, cfdResult);
  const sensorPoints = sensors ? compareSensorsVsCFD(sensors, cfdResult, config) : [];
  const allPoints = [...estimatedPoints, ...sensorPoints];
  const deviation = aggregateDeviation(allPoints);

  return {
    id: crypto.randomUUID(),
    points: allPoints,
    overallDeviationPct: {
      temperature: deviation.temperature,
      velocity: deviation.velocity,
      humidity: deviation.humidity,
    },
    adjustedCoefficients: { ...DEFAULT_CALIBRATION_COEFFICIENTS },
    convergenceHistory: [deviation.overall],
    iterations: 0,
    sensorReadings: sensors ?? [],
    timestamp: new Date().toISOString(),
  };
}
