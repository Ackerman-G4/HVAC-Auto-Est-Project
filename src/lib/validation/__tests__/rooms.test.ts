import { describe, expect, it } from 'vitest';
import { createRoomSchema, updateRoomSchema } from '../rooms';

/**
 * The rooms request contract.
 *
 * The handler previously defaulted with `body.<field> || <fallback>`, which is
 * not what a default is: `||` fires on every falsy value, so a supplied `0` was
 * replaced. Two of the affected fields are loads feeding the cooling
 * calculation, so the substitution propagated into equipment sizing and the BOQ
 * total. The zero-preservation cases below are the point of this file.
 */

const minimal = { name: 'Server Room', area: 40 };

describe('a supplied zero survives', () => {
  it('keeps lightingDensity 0 instead of substituting 15 W/m²', () => {
    // `body.lightingDensity || 15` turned an unlit room into 15 W/m², which is
    // a real lighting load the user did not ask for.
    const parsed = createRoomSchema.parse({ ...minimal, lightingDensity: 0 });
    expect(parsed.lightingDensity).toBe(0);
  });

  it('keeps equipmentLoad 0 instead of substituting 10 W/m²', () => {
    const parsed = createRoomSchema.parse({ ...minimal, equipmentLoad: 0 });
    expect(parsed.equipmentLoad).toBe(0);
  });

  it('keeps floorNumber 0, which is a real floor label', () => {
    const parsed = createRoomSchema.parse({ ...minimal, floorNumber: 0 });
    expect(parsed.floorNumber).toBe(0);
  });

  it('keeps windowArea 0 and occupantCount 0', () => {
    const parsed = createRoomSchema.parse({ ...minimal, windowArea: 0, occupantCount: 0 });
    expect(parsed.windowArea).toBe(0);
    expect(parsed.occupantCount).toBe(0);
  });
});

describe('defaults apply only when the field is absent', () => {
  it('fills the documented defaults', () => {
    const parsed = createRoomSchema.parse(minimal);
    expect(parsed.lightingDensity).toBe(15);
    expect(parsed.equipmentLoad).toBe(10);
    expect(parsed.floorNumber).toBe(1);
    expect(parsed.spaceType).toBe('office');
    expect(parsed.windowOrientation).toBe('N');
    expect(parsed.hasRoofExposure).toBe(false);
  });

  it('leaves ceilingHeight absent so the room can inherit the floor', () => {
    // A default here would silently override the floor's height.
    const parsed = createRoomSchema.parse(minimal);
    expect(parsed.ceilingHeight).toBeUndefined();
  });
});

describe('physically impossible values are rejected', () => {
  it('rejects a zero ceiling height, which has no volume', () => {
    expect(createRoomSchema.safeParse({ ...minimal, ceilingHeight: 0 }).success).toBe(false);
  });

  it('rejects a negative ceiling height', () => {
    expect(createRoomSchema.safeParse({ ...minimal, ceilingHeight: -2.7 }).success).toBe(false);
  });

  it('rejects a negative area', () => {
    expect(createRoomSchema.safeParse({ ...minimal, area: -40 }).success).toBe(false);
  });

  it('rejects a non-finite area, which would propagate as Infinity', () => {
    expect(createRoomSchema.safeParse({ ...minimal, area: Infinity }).success).toBe(false);
    expect(createRoomSchema.safeParse({ ...minimal, area: NaN }).success).toBe(false);
  });

  it('rejects a fractional occupant count', () => {
    expect(createRoomSchema.safeParse({ ...minimal, occupantCount: 2.5 }).success).toBe(false);
  });
});

describe('enumerated fields are constrained', () => {
  it('accepts a known space type', () => {
    expect(createRoomSchema.parse({ ...minimal, spaceType: 'server_room' }).spaceType).toBe('server_room');
  });

  it('rejects an unknown space type rather than storing it', () => {
    // This previously reached persistence unchecked and then fed a lookup that
    // silently returned no coefficients.
    expect(createRoomSchema.safeParse({ ...minimal, spaceType: 'submarine' }).success).toBe(false);
  });

  it('rejects an unknown window orientation', () => {
    expect(createRoomSchema.safeParse({ ...minimal, windowOrientation: 'NNW' }).success).toBe(false);
  });
});

describe('dual-control overrides', () => {
  it('distinguishes clearing an override from omitting it', () => {
    // null clears; absent leaves the stored value alone. Collapsing the two
    // would make an override impossible to remove.
    expect(createRoomSchema.parse({ ...minimal, userTrOverride: null }).userTrOverride).toBeNull();
    expect(createRoomSchema.parse(minimal).userTrOverride).toBeUndefined();
  });

  it('rejects a negative override', () => {
    expect(createRoomSchema.safeParse({ ...minimal, userTrOverride: -5 }).success).toBe(false);
  });
});

describe('update requires at least one field', () => {
  it('rejects an empty patch rather than issuing a no-op write', () => {
    expect(updateRoomSchema.safeParse({}).success).toBe(false);
  });

  it('applies no defaults, so unmentioned fields are not reset', () => {
    const parsed = updateRoomSchema.parse({ name: 'Renamed' });
    expect(parsed).toEqual({ name: 'Renamed' });
    expect('lightingDensity' in parsed).toBe(false);
  });
});
