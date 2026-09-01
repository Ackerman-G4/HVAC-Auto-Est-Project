import { describe, expect, it } from 'vitest';
import {
  createEquipmentSelectionSchema,
  updateEquipmentSelectionSchema,
  isAutoSizeRequest,
} from '../equipment';

/**
 * The equipment selection contract.
 *
 * `body.quantity || 1` promoted a zero-unit selection to one unit, which was
 * then priced and carried into the BOQ — a phantom unit on the money path. The
 * schema rejects 0 outright rather than defaulting it, because a zero-unit
 * selection is not a meaningful record to store either way.
 */

const manual = { roomId: 'room-1', model: 'FTKF35A' };

describe('quantity', () => {
  it('rejects zero rather than promoting it to one', () => {
    // The old `|| 1` wrote 1 here and costed it.
    expect(createEquipmentSelectionSchema.safeParse({ ...manual, quantity: 0 }).success).toBe(false);
  });

  it('rejects a negative quantity', () => {
    expect(createEquipmentSelectionSchema.safeParse({ ...manual, quantity: -2 }).success).toBe(false);
  });

  it('rejects a fractional quantity, since units are discrete', () => {
    expect(createEquipmentSelectionSchema.safeParse({ ...manual, quantity: 1.5 }).success).toBe(false);
  });

  it('defaults to one only when the field is absent', () => {
    const parsed = createEquipmentSelectionSchema.parse(manual);
    expect(isAutoSizeRequest(parsed)).toBe(false);
    if (isAutoSizeRequest(parsed)) return;
    expect(parsed.quantity).toBe(1);
  });

  it('preserves a supplied quantity', () => {
    const parsed = createEquipmentSelectionSchema.parse({ ...manual, quantity: 7 });
    if (isAutoSizeRequest(parsed)) return;
    expect(parsed.quantity).toBe(7);
  });
});

describe('the two operations are distinguished', () => {
  it('accepts an auto-size request without a room', () => {
    const parsed = createEquipmentSelectionSchema.parse({ autoSize: true });
    expect(isAutoSizeRequest(parsed)).toBe(true);
    if (!isAutoSizeRequest(parsed)) return;
    expect(parsed.budgetLevel).toBe('mid-range');
  });

  it('requires a room for a manual selection', () => {
    // A flat schema would have to make roomId optional to accommodate
    // auto-size, letting a manual selection through with nothing to attach to.
    expect(createEquipmentSelectionSchema.safeParse({ model: 'FTKF35A' }).success).toBe(false);
  });

  it('requires a model for a manual selection', () => {
    expect(createEquipmentSelectionSchema.safeParse({ roomId: 'room-1' }).success).toBe(false);
  });

  it('rejects a body that is neither operation', () => {
    expect(createEquipmentSelectionSchema.safeParse({}).success).toBe(false);
  });
});

describe('enumerated and bounded fields', () => {
  it('rejects an equipment type outside the catalogue vocabulary', () => {
    // An unrecognised type previously reached the sizing call and matched
    // nothing, yielding no candidates rather than an error.
    expect(
      createEquipmentSelectionSchema.safeParse({ autoSize: true, preferredType: 'swamp_cooler' }).success,
    ).toBe(false);
  });

  it('accepts a known equipment type', () => {
    expect(
      createEquipmentSelectionSchema.safeParse({ autoSize: true, preferredType: 'vrf_indoor' }).success,
    ).toBe(true);
  });

  it('rejects an unknown budget level', () => {
    expect(
      createEquipmentSelectionSchema.safeParse({ autoSize: true, budgetLevel: 'luxury' }).success,
    ).toBe(false);
  });

  it('rejects a non-finite capacity, which would divide to Infinity downstream', () => {
    expect(createEquipmentSelectionSchema.safeParse({ ...manual, capacityTR: Infinity }).success).toBe(false);
    expect(createEquipmentSelectionSchema.safeParse({ ...manual, capacityTR: NaN }).success).toBe(false);
  });

  it('rejects a zero capacity, the exact input that corrupts equipment quantity', () => {
    // required TR / unit capacity TR with a zero denominator is finding F2.
    expect(createEquipmentSelectionSchema.safeParse({ ...manual, capacityTR: 0 }).success).toBe(false);
  });

  it('rejects a negative unit price', () => {
    expect(createEquipmentSelectionSchema.safeParse({ ...manual, unitPrice: -100 }).success).toBe(false);
  });
});

describe('update', () => {
  it('rejects an empty patch', () => {
    expect(updateEquipmentSelectionSchema.safeParse({}).success).toBe(false);
  });

  it('allows clearing an override with null', () => {
    const parsed = updateEquipmentSelectionSchema.parse({ userUnitPriceOverride: null });
    expect(parsed.userUnitPriceOverride).toBeNull();
  });

  it('rejects a zero quantity override, matching create', () => {
    expect(updateEquipmentSelectionSchema.safeParse({ userQuantityOverride: 0 }).success).toBe(false);
  });

  it('accepts useSuggested, which reverts both overrides', () => {
    // Distinct from clearing one override with null, and from omitting the
    // field to leave the stored value alone. Collapsing the three would make
    // reverting to the engine figure impossible to express.
    expect(updateEquipmentSelectionSchema.parse({ useSuggested: true }).useSuggested).toBe(true);
  });
});
