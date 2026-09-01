import { describe, expect, it } from 'vitest';
import {
  createProjectSchema,
  updateProjectSchema,
  createFloorSchema,
  updateFloorSchema,
} from '../projects';

/**
 * The projects and floors contracts.
 *
 * Design conditions feed the cooling-load calculation and the cost multipliers
 * feed the BOQ total, so "is a number" is not a sufficient check here. An
 * outdoor dry bulb of 500°C parses perfectly and yields a plausible-looking,
 * entirely wrong load — nothing downstream would flag it.
 */

const minimalProject = { name: 'BGC Tower' };

describe('design conditions are physically bounded', () => {
  it('accepts a realistic Manila design condition', () => {
    const parsed = createProjectSchema.parse({
      ...minimalProject,
      outdoorDB: 35,
      outdoorRH: 70,
      indoorDB: 24,
      indoorRH: 50,
    });
    expect(parsed.outdoorDB).toBe(35);
  });

  it('rejects a temperature outside terrestrial design conditions', () => {
    expect(createProjectSchema.safeParse({ ...minimalProject, outdoorDB: 500 }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...minimalProject, outdoorDB: -200 }).success).toBe(false);
  });

  it('rejects a relative humidity outside 0-100%', () => {
    expect(createProjectSchema.safeParse({ ...minimalProject, outdoorRH: 150 }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...minimalProject, outdoorRH: -5 }).success).toBe(false);
  });

  it('rejects a non-finite temperature', () => {
    expect(createProjectSchema.safeParse({ ...minimalProject, indoorDB: NaN }).success).toBe(false);
    expect(createProjectSchema.safeParse({ ...minimalProject, indoorDB: Infinity }).success).toBe(false);
  });
});

describe('safety and diversity factors', () => {
  it('rejects a zero safety factor, which collapses the load', () => {
    // CLAUDE.md §8.5: dimensionless multipliers, finite and positive.
    expect(createProjectSchema.safeParse({ ...minimalProject, safetyFactor: 0 }).success).toBe(false);
  });

  it('rejects a negative safety factor, which inverts the load', () => {
    expect(createProjectSchema.safeParse({ ...minimalProject, safetyFactor: -1.1 }).success).toBe(false);
  });

  it('permits a diversity factor above one, which is valid in documented cases', () => {
    // Simultaneous peak on a shared system. Bounded rather than capped at 1.
    expect(createProjectSchema.parse({ ...minimalProject, diversityFactor: 1.2 }).diversityFactor).toBe(1.2);
  });

  it('rejects an implausible diversity factor', () => {
    expect(createProjectSchema.safeParse({ ...minimalProject, diversityFactor: 50 }).success).toBe(false);
  });
});

describe('cost parameters', () => {
  it('rejects a percentage outside 0-100', () => {
    expect(updateProjectSchema.safeParse({ suggestedOverheadPercent: 150 }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ suggestedVatRate: -1 }).success).toBe(false);
  });

  it('rejects a zero labour multiplier, which would zero the labour line', () => {
    expect(updateProjectSchema.safeParse({ suggestedLaborMultiplier: 0 }).success).toBe(false);
  });

  it('distinguishes clearing an override from omitting it', () => {
    expect(updateProjectSchema.parse({ laborMultiplierOverride: null }).laborMultiplierOverride).toBeNull();
    expect(updateProjectSchema.parse({ name: 'x' }).laborMultiplierOverride).toBeUndefined();
  });

  it('accepts a zero percentage, which is a real setting', () => {
    // Zero contingency is a deliberate commercial choice, not a missing value.
    expect(updateProjectSchema.parse({ suggestedContingencyPercent: 0 }).suggestedContingencyPercent).toBe(0);
  });
});

describe('project identity and status', () => {
  it('requires a name on create', () => {
    expect(createProjectSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a whitespace-only name', () => {
    expect(createProjectSchema.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(updateProjectSchema.safeParse({ status: 'on_hold' }).success).toBe(false);
  });

  it('rejects a fractional floor count', () => {
    expect(createProjectSchema.safeParse({ ...minimalProject, floorsAboveGrade: 2.5 }).success).toBe(false);
  });

  it('rejects an empty patch', () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(false);
  });
});

describe('floor scale is the divisor for every room polygon', () => {
  it('rejects a zero scale, which sends every vertex to Infinity', () => {
    // Polygon coordinates are divided by scale to reach metres.
    expect(createFloorSchema.safeParse({ scale: 0 }).success).toBe(false);
    expect(updateFloorSchema.safeParse({ scale: 0 }).success).toBe(false);
  });

  it('rejects a negative scale, which mirrors the plan', () => {
    expect(createFloorSchema.safeParse({ scale: -50 }).success).toBe(false);
  });

  it('defaults to 50 px/m when absent', () => {
    expect(createFloorSchema.parse({}).scale).toBe(50);
  });
});

describe('floor geometry', () => {
  it('rejects a zero ceiling height, which encloses no volume', () => {
    expect(createFloorSchema.safeParse({ ceilingHeight: 0 }).success).toBe(false);
  });

  it('keeps floor number 0, which is a real floor label', () => {
    expect(createFloorSchema.parse({ floorNumber: 0 }).floorNumber).toBe(0);
  });

  it('allows a basement level', () => {
    expect(createFloorSchema.parse({ floorNumber: -2 }).floorNumber).toBe(-2);
  });

  it('lets floorPlanImage be cleared with null', () => {
    expect(updateFloorSchema.parse({ floorPlanImage: null }).floorPlanImage).toBeNull();
  });
});
