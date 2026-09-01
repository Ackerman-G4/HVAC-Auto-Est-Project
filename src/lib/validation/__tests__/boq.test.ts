import { describe, expect, it } from 'vitest';
import { updateBoqItemSchema } from '../boq';

/**
 * The BOQ line-item contract.
 *
 * This is the last hop before a currency figure reaches a client-facing
 * document. `quantity` and `suggestedUnitPrice` are multiplied directly, so a
 * non-finite value in either yields a NaN or Infinity line total that
 * propagates into the project sum — and neither was checked.
 */

describe('values that would corrupt a line total', () => {
  it('rejects a non-finite quantity', () => {
    // quantity * unitPrice with Infinity produces an Infinity total that then
    // sums into the project figure.
    expect(updateBoqItemSchema.safeParse({ quantity: Infinity }).success).toBe(false);
    expect(updateBoqItemSchema.safeParse({ quantity: NaN }).success).toBe(false);
  });

  it('rejects a non-finite price', () => {
    expect(updateBoqItemSchema.safeParse({ suggestedUnitPrice: Infinity }).success).toBe(false);
    expect(updateBoqItemSchema.safeParse({ userUnitPriceOverride: NaN }).success).toBe(false);
  });

  it('rejects a negative quantity', () => {
    expect(updateBoqItemSchema.safeParse({ quantity: -5 }).success).toBe(false);
  });

  it('rejects a negative price, which is not a discount', () => {
    expect(updateBoqItemSchema.safeParse({ suggestedUnitPrice: -100 }).success).toBe(false);
    expect(updateBoqItemSchema.safeParse({ userUnitPriceOverride: -100 }).success).toBe(false);
  });

  it('rejects a string where a number is required', () => {
    // Previously this reached the multiplication and produced NaN.
    expect(updateBoqItemSchema.safeParse({ quantity: '5' }).success).toBe(false);
  });
});

describe('zero is meaningful on a BOQ line', () => {
  it('accepts quantity 0, which excludes a line from the total but keeps it visible', () => {
    // Unlike an equipment selection, where 0 units is not a record worth
    // storing, a zeroed BOQ line is a legitimate document state.
    expect(updateBoqItemSchema.parse({ quantity: 0 }).quantity).toBe(0);
  });

  it('accepts a zero price', () => {
    expect(updateBoqItemSchema.parse({ suggestedUnitPrice: 0 }).suggestedUnitPrice).toBe(0);
  });
});

describe('override intent stays three-way', () => {
  it('distinguishes clearing an override from omitting the field', () => {
    expect(updateBoqItemSchema.parse({ userUnitPriceOverride: null }).userUnitPriceOverride).toBeNull();
    expect(updateBoqItemSchema.parse({ notes: 'x' }).userUnitPriceOverride).toBeUndefined();
  });

  it('accepts useSuggested as a revert', () => {
    expect(updateBoqItemSchema.parse({ useSuggested: true }).useSuggested).toBe(true);
  });

  it('still accepts the legacy unitPrice alias', () => {
    // The handler honours it; removing it from the schema would break clients
    // that still send it.
    expect(updateBoqItemSchema.parse({ unitPrice: 1200 }).unitPrice).toBe(1200);
    expect(updateBoqItemSchema.parse({ unitPrice: null }).unitPrice).toBeNull();
  });
});

describe('text fields', () => {
  it('rejects an empty description rather than blanking a line', () => {
    expect(updateBoqItemSchema.safeParse({ description: '   ' }).success).toBe(false);
  });

  it('rejects an empty patch', () => {
    expect(updateBoqItemSchema.safeParse({}).success).toBe(false);
  });
});
