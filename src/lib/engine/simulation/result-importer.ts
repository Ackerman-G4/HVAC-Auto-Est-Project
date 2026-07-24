/**
 * Result Importer
 *
 * Parses external CFD solver output (OpenFOAM / SimFlow / manual upload)
 * and normalizes into internal FieldPayload and ArtifactManifest format.
 */

import { DEFAULT_FIELD_ENVELOPE } from '@/types/simulation';
import type {
  FieldPayload,
  FieldDescriptor,
  ArtifactManifest,
  SimulationMetrics,
  Vec3,
  RunSource,
} from '@/types/simulation';

// ─── Public API ─────────────────────────────────────────────

export interface ImportedFieldData {
  temperature?: number[][][];
  velocity?: Vec3[][][];
  pressure?: number[][][];
  humidity?: number[][][];
}

export interface ImportResult {
  manifest: ArtifactManifest;
  fields: FieldPayload[];
}

/**
 * Import raw field data arrays into the internal format.
 * Data arrays must match the grid dimensions (nx × ny × nz).
 */
export function importFieldData(
  caseId: string,
  runJobId: string,
  source: RunSource,
  dimensions: { nx: number; ny: number; nz: number },
  data: ImportedFieldData,
): ImportResult {
  const fields: FieldPayload[] = [];
  const descriptors: FieldDescriptor[] = [];

  if (data.temperature) {
    validateDimensions('temperature', data.temperature, dimensions);
    const range = scalarRange(data.temperature);
    fields.push({ name: 'temperature', scalarData: data.temperature });
    descriptors.push({
      name: 'temperature',
      dimensions,
      dataType: 'scalar',
      range,
      compressedSizeBytes: estimateSize(dimensions, 'scalar'),
    });
  }

  if (data.velocity) {
    validateDimensions('velocity', data.velocity, dimensions);
    const maxMag = vectorMaxMagnitude(data.velocity);
    fields.push({ name: 'velocity', vectorData: data.velocity });
    descriptors.push({
      name: 'velocity',
      dimensions,
      dataType: 'vector3',
      range: { min: 0, max: maxMag },
      compressedSizeBytes: estimateSize(dimensions, 'vector3'),
    });
  }

  if (data.pressure) {
    validateDimensions('pressure', data.pressure, dimensions);
    const range = scalarRange(data.pressure);
    fields.push({ name: 'pressure', scalarData: data.pressure });
    descriptors.push({
      name: 'pressure',
      dimensions,
      dataType: 'scalar',
      range,
      compressedSizeBytes: estimateSize(dimensions, 'scalar'),
    });
  }

  if (data.humidity) {
    validateDimensions('humidity', data.humidity, dimensions);
    const range = scalarRange(data.humidity);
    fields.push({ name: 'humidity', scalarData: data.humidity });
    descriptors.push({
      name: 'humidity',
      dimensions,
      dataType: 'scalar',
      range,
      compressedSizeBytes: estimateSize(dimensions, 'scalar'),
    });
  }

  const metrics = computeMetricsFromFields(data, dimensions);

  const manifest: ArtifactManifest = {
    caseId,
    runJobId,
    source,
    fieldEnvelope: {
      ...DEFAULT_FIELD_ENVELOPE,
      units: { ...DEFAULT_FIELD_ENVELOPE.units },
      renderAxisMap: { ...DEFAULT_FIELD_ENVELOPE.renderAxisMap },
    },
    fields: descriptors,
    metrics,
    convergenceHistory: [],
    totalSizeBytes: descriptors.reduce((s, d) => s + d.compressedSizeBytes, 0),
    createdAt: new Date().toISOString(),
  };

  return { manifest, fields };
}

/**
 * Parse an OpenFOAM internal field block into a flat number array.
 * Handles both "uniform <val>" and "nonuniform List<scalar>" formats.
 */
export function parseOpenFOAMScalarField(content: string): number[] {
  // Check for uniform value
  const uniformMatch = content.match(/internalField\s+uniform\s+([\d.eE+-]+)/);
  if (uniformMatch) {
    return [parseFloat(uniformMatch[1])];
  }

  // Non-uniform list
  const listMatch = content.match(/internalField\s+nonuniform\s+List<scalar>\s+\d+\s*\(([\s\S]*?)\)/);
  if (listMatch) {
    return listMatch[1]
      .trim()
      .split(/\s+/)
      .filter((s) => s.length > 0)
      .map(Number);
  }

  return [];
}

/**
 * Parse an OpenFOAM vector field into a flat Vec3 array.
 */
export function parseOpenFOAMVectorField(content: string): Vec3[] {
  // Check for uniform value
  const uniformMatch = content.match(/internalField\s+uniform\s+\(([\d.eE+\- ]+)\)/);
  if (uniformMatch) {
    const parts = uniformMatch[1].trim().split(/\s+/).map(Number);
    return [{ x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 }];
  }

  // Non-uniform list
  const listMatch = content.match(/internalField\s+nonuniform\s+List<vector>\s+\d+\s*\(([\s\S]*?)\)/);
  if (listMatch) {
    const vectors: Vec3[] = [];
    const regex = /\(([\d.eE+\- ]+)\)/g;
    let match;
    while ((match = regex.exec(listMatch[1])) !== null) {
      const parts = match[1].trim().split(/\s+/).map(Number);
      vectors.push({ x: parts[0] || 0, y: parts[1] || 0, z: parts[2] || 0 });
    }
    return vectors;
  }

  return [];
}

/**
 * Reshape a flat array into a 3D array [nx][ny][nz].
 */
export function reshapeTo3D<T>(flat: T[], nx: number, ny: number, nz: number): T[][][] {
  if (flat.length !== nx * ny * nz) {
    throw new Error(`Array length ${flat.length} does not match grid ${nx}×${ny}×${nz} = ${nx * ny * nz}`);
  }

  const result: T[][][] = new Array(nx);
  for (let i = 0; i < nx; i++) {
    result[i] = new Array(ny);
    for (let j = 0; j < ny; j++) {
      result[i][j] = new Array(nz);
      for (let k = 0; k < nz; k++) {
        result[i][j][k] = flat[(i * ny + j) * nz + k];
      }
    }
  }
  return result;
}

// ─── Internal Helpers ───────────────────────────────────────

function validateDimensions(
  name: string,
  data: unknown[][][],
  dims: { nx: number; ny: number; nz: number },
): void {
  if (data.length !== dims.nx) {
    throw new Error(`${name}: x-dimension mismatch: got ${data.length}, expected ${dims.nx}`);
  }
  if (data[0]?.length !== dims.ny) {
    throw new Error(`${name}: y-dimension mismatch: got ${data[0]?.length}, expected ${dims.ny}`);
  }
  if (data[0]?.[0]?.length !== dims.nz) {
    throw new Error(`${name}: z-dimension mismatch: got ${data[0]?.[0]?.length}, expected ${dims.nz}`);
  }
}

function scalarRange(data: number[][][]): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const plane of data) {
    for (const row of plane) {
      for (const val of row) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
  }
  return { min, max };
}

function vectorMaxMagnitude(data: Vec3[][][]): number {
  let maxMag = 0;
  for (const plane of data) {
    for (const row of plane) {
      for (const v of row) {
        const mag = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (mag > maxMag) maxMag = mag;
      }
    }
  }
  return maxMag;
}

function estimateSize(dims: { nx: number; ny: number; nz: number }, type: 'scalar' | 'vector3'): number {
  const cellCount = dims.nx * dims.ny * dims.nz;
  const bytesPerCell = type === 'scalar' ? 4 : 12;
  return Math.ceil(cellCount * bytesPerCell * 0.6); // ~60% compression estimate
}

function computeMetricsFromFields(
  data: ImportedFieldData,
  _dims: { nx: number; ny: number; nz: number },
): SimulationMetrics {
  const tempRange = data.temperature ? scalarRange(data.temperature) : { min: 20, max: 30 };
  const humRange = data.humidity ? scalarRange(data.humidity) : { min: 0.005, max: 0.012 };
  const velMax = data.velocity ? vectorMaxMagnitude(data.velocity) : 0;

  // Compute averages from temperature field if available
  let avgTemp = (tempRange.min + tempRange.max) / 2;
  let avgHum = (humRange.min + humRange.max) / 2;

  if (data.temperature) {
    let sum = 0;
    let count = 0;
    for (const plane of data.temperature) {
      for (const row of plane) {
        for (const val of row) {
          sum += val;
          count++;
        }
      }
    }
    avgTemp = count > 0 ? sum / count : avgTemp;
  }

  if (data.humidity) {
    let sum = 0;
    let count = 0;
    for (const plane of data.humidity) {
      for (const row of plane) {
        for (const val of row) {
          sum += val;
          count++;
        }
      }
    }
    avgHum = count > 0 ? sum / count : avgHum;
  }

  return {
    maxTemperature: tempRange.max,
    minTemperature: tempRange.min,
    avgTemperature: avgTemp,
    maxHumidityRatio: humRange.max,
    minHumidityRatio: humRange.min,
    avgHumidityRatio: avgHum,
    maxVelocity: velMax,
    avgVelocity: velMax * 0.5, // Rough estimate
    totalHeatLoad: 0,
    totalCoolingCapacity: 0,
    coolingDeficit: 0,
    hotspots: [],
    pue: 0,
    supplyHeatIndex: 0,
    returnHeatIndex: 0,
    rackInletTemps: [],
    continuityResidual: 0,
    momentumResidual: 0,
    energyResidual: 0,
    turbulenceResidual: 0,
    maxDivergence: 0,
    converged: true,
    avgTurbulentViscosity: 0,
    maxTurbulentIntensity: 0,
  };
}
