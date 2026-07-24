import { describe, it, expect } from 'vitest';
import { buildRunFieldSnapshotFromFields } from '@/lib/simulation/field-snapshot';
import { runSourceForBackend, SOLVER_BACKEND_META, type FieldPayload } from '@/types/simulation';

function scalarField(nx: number, ny: number, nz: number, fill: number): number[][][] {
  return Array.from({ length: nx }, () =>
    Array.from({ length: ny }, () => Array.from({ length: nz }, () => fill)),
  );
}

describe('solver backend mapping', () => {
  it('maps tiers to the right run source', () => {
    expect(runSourceForBackend('preview')).toBe('internal');
    expect(runSourceForBackend('engineering')).toBe('openfoam');
    expect(SOLVER_BACKEND_META.engineering.runSource).toBe('openfoam');
    expect(SOLVER_BACKEND_META.preview.runSource).toBe('internal');
  });
});

describe('buildRunFieldSnapshotFromFields', () => {
  it('preserves field names, tags the source, and stays within the cell budget', () => {
    const dims = { nx: 8, ny: 6, nz: 4 };
    const fields: FieldPayload[] = [
      { name: 'temperature', scalarData: scalarField(dims.nx, dims.ny, dims.nz, 24) },
      {
        name: 'velocity',
        vectorData: Array.from({ length: dims.nx }, () =>
          Array.from({ length: dims.ny }, () =>
            Array.from({ length: dims.nz }, () => ({ x: 1, y: 0, z: 0 })),
          ),
        ),
      },
    ];

    const snapshot = buildRunFieldSnapshotFromFields({
      caseId: 'c1',
      runJobId: 'r1',
      source: 'openfoam',
      dimensions: dims,
      fields,
      iteration: 42,
    });

    expect(snapshot.meta.source).toBe('openfoam');
    expect(snapshot.meta.iteration).toBe(42);
    expect(snapshot.meta.availableFields).toEqual(['temperature', 'velocity']);
    expect(snapshot.fields).toHaveLength(2);
    // Downsampled dims never exceed the source dims.
    expect(snapshot.meta.dimensions.nx).toBeLessThanOrEqual(dims.nx);
    expect(snapshot.meta.cellCount).toBe(
      snapshot.meta.dimensions.nx * snapshot.meta.dimensions.ny * snapshot.meta.dimensions.nz,
    );
    // A downsampled scalar cell keeps the original constant value.
    const temp = snapshot.fields.find((f) => f.name === 'temperature');
    expect(temp?.scalarData?.[0]?.[0]?.[0]).toBe(24);
  });
});
