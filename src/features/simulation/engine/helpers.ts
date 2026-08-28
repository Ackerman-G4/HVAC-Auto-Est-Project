import type { RunFieldSnapshot, Vec3 } from '@/types/simulation';
import { SNAPSHOT_PREVIEW_MODES } from './constants';
import type { SnapshotDims, SnapshotPreviewMode, SnapshotTimelinePreference } from './types';

export function isSnapshotPreviewMode(value: unknown): value is SnapshotPreviewMode {
  return SNAPSHOT_PREVIEW_MODES.includes(value as SnapshotPreviewMode);
}

export function parseSnapshotTimelineByCase(
  value: unknown,
): Record<string, SnapshotTimelinePreference> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const parsed: Record<string, SnapshotTimelinePreference> = {};

  for (const [caseId, preference] of Object.entries(value as Record<string, unknown>)) {
    if (!preference || typeof preference !== 'object' || Array.isArray(preference)) {
      continue;
    }

    const candidate = preference as { runId?: unknown; iteration?: unknown };
    const runId = typeof candidate.runId === 'string' && candidate.runId.length > 0
      ? candidate.runId
      : null;
    const iteration = typeof candidate.iteration === 'number'
      && Number.isInteger(candidate.iteration)
      && candidate.iteration > 0
      ? candidate.iteration
      : null;

    if (runId !== null || iteration !== null) {
      parsed[caseId] = { runId, iteration };
    }
  }

  return parsed;
}

export function createScalarField(dims: SnapshotDims, fallback: number): number[][][] {
  const out: number[][][] = new Array(dims.nx);
  for (let x = 0; x < dims.nx; x += 1) {
    const yz: number[][] = new Array(dims.ny);
    for (let y = 0; y < dims.ny; y += 1) {
      yz[y] = new Array(dims.nz).fill(fallback);
    }
    out[x] = yz;
  }
  return out;
}

export function createVectorField(dims: SnapshotDims): Vec3[][][] {
  const out: Vec3[][][] = new Array(dims.nx);
  for (let x = 0; x < dims.nx; x += 1) {
    const yz: Vec3[][] = new Array(dims.ny);
    for (let y = 0; y < dims.ny; y += 1) {
      const zValues: Vec3[] = new Array(dims.nz);
      for (let z = 0; z < dims.nz; z += 1) {
        zValues[z] = { x: 0, y: 0, z: 0 };
      }
      yz[y] = zValues;
    }
    out[x] = yz;
  }
  return out;
}

export function resolveSnapshotScalarField(
  snapshot: RunFieldSnapshot,
  fieldName: 'temperature' | 'pressure' | 'humidity',
  dims: SnapshotDims,
  fallback: number,
): number[][][] {
  const payload = snapshot.fields.find((field) => field.name === fieldName);
  return payload?.scalarData ?? createScalarField(dims, fallback);
}

export function resolveSnapshotVelocityField(
  snapshot: RunFieldSnapshot,
  dims: SnapshotDims,
): Vec3[][][] {
  const payload = snapshot.fields.find((field) => field.name === 'velocity');
  return payload?.vectorData ?? createVectorField(dims);
}

export function summarizeScalarField(field: number[][][]): { min: number; max: number; avg: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let count = 0;

  for (const yz of field) {
    for (const zValues of yz) {
      for (const value of zValues) {
        min = Math.min(min, value);
        max = Math.max(max, value);
        sum += value;
        count += 1;
      }
    }
  }

  if (count === 0) {
    return { min: 0, max: 0, avg: 0 };
  }

  return {
    min,
    max,
    avg: sum / count,
  };
}

export function summarizeVelocityField(field: Vec3[][][]): { max: number; avg: number } {
  let max = 0;
  let sum = 0;
  let count = 0;

  for (const yz of field) {
    for (const zValues of yz) {
      for (const vec of zValues) {
        const speed = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
        max = Math.max(max, speed);
        sum += speed;
        count += 1;
      }
    }
  }

  if (count === 0) {
    return { max: 0, avg: 0 };
  }

  return {
    max,
    avg: sum / count,
  };
}
