import { DEFAULT_FIELD_ENVELOPE } from '@/types/simulation';
import type {
  FieldPayload,
  RunFieldSnapshot,
  RunSource,
  SimulationResult,
  Vec3,
} from '@/types/simulation';

const DEFAULT_MAX_SNAPSHOT_CELLS = 12_000;

function cloneDefaultFieldEnvelope() {
  return {
    ...DEFAULT_FIELD_ENVELOPE,
    units: { ...DEFAULT_FIELD_ENVELOPE.units },
    renderAxisMap: { ...DEFAULT_FIELD_ENVELOPE.renderAxisMap },
  };
}

function resolveSampleStride(nx: number, ny: number, nz: number, maxCells: number): number {
  let stride = 1;
  const safeMaxCells = Math.max(1, Math.floor(maxCells));

  while (Math.ceil(nx / stride) * Math.ceil(ny / stride) * Math.ceil(nz / stride) > safeMaxCells) {
    stride += 1;
  }

  return stride;
}

function sampledDim(size: number, stride: number): number {
  return Math.max(1, Math.ceil(size / stride));
}

function sourceIndex(sampledIndex: number, stride: number, sourceSize: number): number {
  return Math.min(sampledIndex * stride, Math.max(sourceSize - 1, 0));
}

function downsampleScalarField(
  field: number[][][],
  sourceDims: { nx: number; ny: number; nz: number },
  stride: number,
): number[][][] {
  const nx = sampledDim(sourceDims.nx, stride);
  const ny = sampledDim(sourceDims.ny, stride);
  const nz = sampledDim(sourceDims.nz, stride);
  const output: number[][][] = [];

  for (let x = 0; x < nx; x++) {
    output[x] = [];
    const sx = sourceIndex(x, stride, sourceDims.nx);
    for (let y = 0; y < ny; y++) {
      output[x][y] = [];
      const sy = sourceIndex(y, stride, sourceDims.ny);
      for (let z = 0; z < nz; z++) {
        const sz = sourceIndex(z, stride, sourceDims.nz);
        output[x][y][z] = field[sx]?.[sy]?.[sz] ?? 0;
      }
    }
  }

  return output;
}

function downsampleVectorField(
  field: Vec3[][][],
  sourceDims: { nx: number; ny: number; nz: number },
  stride: number,
): Vec3[][][] {
  const nx = sampledDim(sourceDims.nx, stride);
  const ny = sampledDim(sourceDims.ny, stride);
  const nz = sampledDim(sourceDims.nz, stride);
  const output: Vec3[][][] = [];

  for (let x = 0; x < nx; x++) {
    output[x] = [];
    const sx = sourceIndex(x, stride, sourceDims.nx);
    for (let y = 0; y < ny; y++) {
      output[x][y] = [];
      const sy = sourceIndex(y, stride, sourceDims.ny);
      for (let z = 0; z < nz; z++) {
        const sz = sourceIndex(z, stride, sourceDims.nz);
        const vector = field[sx]?.[sy]?.[sz];
        output[x][y][z] = {
          x: vector?.x ?? 0,
          y: vector?.y ?? 0,
          z: vector?.z ?? 0,
        };
      }
    }
  }

  return output;
}

export function buildRunFieldSnapshotFromResult(input: {
  caseId: string;
  runJobId: string;
  source: RunSource;
  result: SimulationResult;
  maxCells?: number;
}): RunFieldSnapshot {
  const { caseId, runJobId, source, result } = input;
  const maxCells = input.maxCells ?? DEFAULT_MAX_SNAPSHOT_CELLS;

  const sourceDims = {
    nx: result.config.gridSizeX,
    ny: result.config.gridSizeY,
    nz: result.config.gridSizeZ,
  };

  const sampleStride = resolveSampleStride(sourceDims.nx, sourceDims.ny, sourceDims.nz, maxCells);
  const dimensions = {
    nx: sampledDim(sourceDims.nx, sampleStride),
    ny: sampledDim(sourceDims.ny, sampleStride),
    nz: sampledDim(sourceDims.nz, sampleStride),
  };

  const fields: FieldPayload[] = [
    {
      name: 'temperature',
      scalarData: downsampleScalarField(result.temperatureField, sourceDims, sampleStride),
    },
    {
      name: 'velocity',
      vectorData: downsampleVectorField(result.velocityField, sourceDims, sampleStride),
    },
    {
      name: 'pressure',
      scalarData: downsampleScalarField(result.pressureField, sourceDims, sampleStride),
    },
    {
      name: 'humidity',
      scalarData: downsampleScalarField(result.humidityField, sourceDims, sampleStride),
    },
  ];

  return {
    meta: {
      caseId,
      runJobId,
      iteration: result.iteration,
      source,
      fieldEnvelope: cloneDefaultFieldEnvelope(),
      dimensions,
      sampleStride,
      cellCount: dimensions.nx * dimensions.ny * dimensions.nz,
      availableFields: fields.map((field) => field.name),
      createdAt: new Date().toISOString(),
    },
    fields,
  };
}
