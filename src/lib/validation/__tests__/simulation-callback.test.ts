import { describe, expect, it } from 'vitest';
import { openFoamCallbackSchema, MAX_TOTAL_CELLS } from '../simulation-callback';

/**
 * The OpenFOAM solver callback.
 *
 * The least trusted input in the system: it arrives server-to-server
 * authenticated only by a shared header secret, so anything holding that secret
 * can post anything, and there is no user account behind it to reason about.
 *
 * It was handled with `(await request.json()) as CallbackBody` — a cast, not a
 * check. The interface was erased at compile time, so every field arrived
 * unverified while looking typed at the call site.
 */

/** A [x][y][z] scalar field of the given dimensions. */
function scalarField(nx: number, ny: number, nz: number, value = 21) {
  return Array.from({ length: nx }, () =>
    Array.from({ length: ny }, () => Array.from({ length: nz }, () => value)),
  );
}

const completed = {
  status: 'completed' as const,
  dimensions: { nx: 2, ny: 2, nz: 2 },
  data: { temperature: scalarField(2, 2, 2) },
};

describe('grid dimensions bound the work a callback can request', () => {
  it('accepts a realistic mesh', () => {
    expect(openFoamCallbackSchema.safeParse(completed).success).toBe(true);
  });

  it('rejects a cell count that would exhaust memory', () => {
    // Each axis is inside the per-axis cap; the product is not. A per-axis
    // bound alone would let 2000^3 through.
    const parsed = openFoamCallbackSchema.safeParse({
      ...completed,
      dimensions: { nx: 2000, ny: 2000, nz: 2000 },
    });
    expect(parsed.success).toBe(false);
    expect(2000 ** 3).toBeGreaterThan(MAX_TOTAL_CELLS);
  });

  it('rejects a zero axis, which describes no grid at all', () => {
    expect(
      openFoamCallbackSchema.safeParse({ ...completed, dimensions: { nx: 0, ny: 10, nz: 10 } }).success,
    ).toBe(false);
  });

  it('rejects a negative axis', () => {
    expect(
      openFoamCallbackSchema.safeParse({ ...completed, dimensions: { nx: -10, ny: 10, nz: 10 } }).success,
    ).toBe(false);
  });

  it('rejects a fractional axis, since cells are discrete', () => {
    expect(
      openFoamCallbackSchema.safeParse({ ...completed, dimensions: { nx: 10.5, ny: 10, nz: 10 } }).success,
    ).toBe(false);
  });

  it('allows dimensions to be omitted, so the stored case mesh can supply them', () => {
    const { dimensions: _omitted, ...withoutDimensions } = completed;
    expect(openFoamCallbackSchema.safeParse(withoutDimensions).success).toBe(true);
  });
});

describe('field contents are checked, not just field shape', () => {
  it('rejects strings in a correctly-shaped array', () => {
    // The importer's validateDimensions only compares lengths, so this passed
    // it — and scalarRange then compared strings with `<`, yielding a garbage
    // min/max with no error raised anywhere.
    const poisoned = scalarField(2, 2, 2) as unknown as number[][][];
    poisoned[0][0][0] = '21' as unknown as number;

    expect(
      openFoamCallbackSchema.safeParse({ ...completed, data: { temperature: poisoned } }).success,
    ).toBe(false);
  });

  it('rejects NaN, which poisons every aggregate computed from the field', () => {
    const poisoned = scalarField(2, 2, 2);
    poisoned[1][1][1] = NaN;

    expect(
      openFoamCallbackSchema.safeParse({ ...completed, data: { temperature: poisoned } }).success,
    ).toBe(false);
  });

  it('rejects Infinity', () => {
    const poisoned = scalarField(2, 2, 2);
    poisoned[0][1][0] = Infinity;

    expect(
      openFoamCallbackSchema.safeParse({ ...completed, data: { temperature: poisoned } }).success,
    ).toBe(false);
  });

  it('requires velocity cells to be complete vectors', () => {
    const velocity = [[[{ x: 1, y: 2 }]]];
    expect(
      openFoamCallbackSchema.safeParse({
        status: 'completed',
        dimensions: { nx: 1, ny: 1, nz: 1 },
        data: { velocity },
      }).success,
    ).toBe(false);
  });

  it('accepts a well-formed velocity field', () => {
    const velocity = [[[{ x: 1, y: 2, z: 3 }]]];
    expect(
      openFoamCallbackSchema.safeParse({
        status: 'completed',
        dimensions: { nx: 1, ny: 1, nz: 1 },
        data: { velocity },
      }).success,
    ).toBe(true);
  });

  it('requires at least one field on a completed callback', () => {
    expect(
      openFoamCallbackSchema.safeParse({ status: 'completed', data: {} }).success,
    ).toBe(false);
  });

  it('requires data at all on a completed callback', () => {
    // Previously a hand-rolled MISSING_FIELDS check after the cast.
    expect(openFoamCallbackSchema.safeParse({ status: 'completed' }).success).toBe(false);
  });
});

describe('status discriminates what the rest of the body must contain', () => {
  it('accepts a failure without field data', () => {
    const parsed = openFoamCallbackSchema.safeParse({
      status: 'failed',
      errorMessage: 'solver diverged',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a status outside the two the handler understands', () => {
    // Previously a hand-rolled BAD_CALLBACK_STATUS check.
    expect(openFoamCallbackSchema.safeParse({ status: 'running' }).success).toBe(false);
  });

  it('rejects a missing status', () => {
    expect(openFoamCallbackSchema.safeParse({ data: { temperature: scalarField(1, 1, 1) } }).success).toBe(false);
  });
});

describe('unbounded text fields', () => {
  it('rejects a log tail long enough to be a payload attack', () => {
    const logTail = Array.from({ length: 6000 }, () => 'line');
    expect(openFoamCallbackSchema.safeParse({ status: 'failed', logTail }).success).toBe(false);
  });

  it('rejects a non-string log line', () => {
    expect(
      openFoamCallbackSchema.safeParse({ status: 'failed', logTail: [{ msg: 'x' }] }).success,
    ).toBe(false);
  });

  it('rejects a negative iteration', () => {
    expect(
      openFoamCallbackSchema.safeParse({ ...completed, iteration: -1 }).success,
    ).toBe(false);
  });
});
