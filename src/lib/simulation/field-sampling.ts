import type { Vec3 } from '@/types/simulation';

export interface FieldSamplingSpec {
  resolution: number;
  sizeX: number;
  sizeY: number;
  sizeZ: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function axisIndices(world: number, resolution: number, size: number): { i0: number; i1: number; t: number } {
  const maxIndex = Math.max(size - 1, 0);
  const safeResolution = resolution > 0 ? resolution : 1;
  const f = clamp(world / safeResolution, 0, maxIndex);
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, maxIndex);
  const t = i1 === i0 ? 0 : f - i0;
  return { i0, i1, t };
}

function scalarAt(field: number[][][], x: number, y: number, z: number, fallback: number): number {
  return field[x]?.[y]?.[z] ?? fallback;
}

function vectorAt(field: Vec3[][][], x: number, y: number, z: number, fallback: Vec3): Vec3 {
  return field[x]?.[y]?.[z] ?? fallback;
}

export function sampleScalarTrilinear(
  field: number[][][],
  worldX: number,
  worldY: number,
  worldZ: number,
  spec: FieldSamplingSpec,
  fallback: number,
): number {
  const ax = axisIndices(worldX, spec.resolution, spec.sizeX);
  const ay = axisIndices(worldY, spec.resolution, spec.sizeY);
  const az = axisIndices(worldZ, spec.resolution, spec.sizeZ);

  const c000 = scalarAt(field, ax.i0, ay.i0, az.i0, fallback);
  const c100 = scalarAt(field, ax.i1, ay.i0, az.i0, fallback);
  const c010 = scalarAt(field, ax.i0, ay.i1, az.i0, fallback);
  const c110 = scalarAt(field, ax.i1, ay.i1, az.i0, fallback);
  const c001 = scalarAt(field, ax.i0, ay.i0, az.i1, fallback);
  const c101 = scalarAt(field, ax.i1, ay.i0, az.i1, fallback);
  const c011 = scalarAt(field, ax.i0, ay.i1, az.i1, fallback);
  const c111 = scalarAt(field, ax.i1, ay.i1, az.i1, fallback);

  const c00 = lerp(c000, c100, ax.t);
  const c10 = lerp(c010, c110, ax.t);
  const c01 = lerp(c001, c101, ax.t);
  const c11 = lerp(c011, c111, ax.t);

  const c0 = lerp(c00, c10, ay.t);
  const c1 = lerp(c01, c11, ay.t);

  return lerp(c0, c1, az.t);
}

export function sampleVectorTrilinear(
  field: Vec3[][][],
  worldX: number,
  worldY: number,
  worldZ: number,
  spec: FieldSamplingSpec,
  fallback: Vec3,
): Vec3 {
  const ax = axisIndices(worldX, spec.resolution, spec.sizeX);
  const ay = axisIndices(worldY, spec.resolution, spec.sizeY);
  const az = axisIndices(worldZ, spec.resolution, spec.sizeZ);

  const v000 = vectorAt(field, ax.i0, ay.i0, az.i0, fallback);
  const v100 = vectorAt(field, ax.i1, ay.i0, az.i0, fallback);
  const v010 = vectorAt(field, ax.i0, ay.i1, az.i0, fallback);
  const v110 = vectorAt(field, ax.i1, ay.i1, az.i0, fallback);
  const v001 = vectorAt(field, ax.i0, ay.i0, az.i1, fallback);
  const v101 = vectorAt(field, ax.i1, ay.i0, az.i1, fallback);
  const v011 = vectorAt(field, ax.i0, ay.i1, az.i1, fallback);
  const v111 = vectorAt(field, ax.i1, ay.i1, az.i1, fallback);

  const x00 = lerp(v000.x, v100.x, ax.t);
  const y00 = lerp(v000.y, v100.y, ax.t);
  const z00 = lerp(v000.z, v100.z, ax.t);

  const x10 = lerp(v010.x, v110.x, ax.t);
  const y10 = lerp(v010.y, v110.y, ax.t);
  const z10 = lerp(v010.z, v110.z, ax.t);

  const x01 = lerp(v001.x, v101.x, ax.t);
  const y01 = lerp(v001.y, v101.y, ax.t);
  const z01 = lerp(v001.z, v101.z, ax.t);

  const x11 = lerp(v011.x, v111.x, ax.t);
  const y11 = lerp(v011.y, v111.y, ax.t);
  const z11 = lerp(v011.z, v111.z, ax.t);

  const x0 = lerp(x00, x10, ay.t);
  const y0 = lerp(y00, y10, ay.t);
  const z0 = lerp(z00, z10, ay.t);

  const x1 = lerp(x01, x11, ay.t);
  const y1 = lerp(y01, y11, ay.t);
  const z1 = lerp(z01, z11, ay.t);

  return {
    x: lerp(x0, x1, az.t),
    y: lerp(y0, y1, az.t),
    z: lerp(z0, z1, az.t),
  };
}
