/**
 * validate:price-override — proves the Wave 8 money-path repair:
 *   1. admin overrides win over the catalog price, and
 *   2. a real catalog SKU's price/capacity are resolved server-side, NOT trusted
 *      from a client-supplied unitPrice.
 *
 * Run: npm run validate:price-override
 */

import { describe, it, expect } from 'vitest';
import { EQUIPMENT_CATALOG } from '@/constants/equipment-catalog';
import {
  resolveUnitPrice,
  resolveManualSelection,
  findCatalogEntryByModel,
} from '@/lib/functions/equipment-pricing';
import type { PriceOverrideRecord } from '@/lib/firebase/price-override-store';

const sku = EQUIPMENT_CATALOG[0]; // a real catalog SKU (e.g. Daikin FTV25AV1)

function overrideFor(model: string, price: number): Map<string, PriceOverrideRecord> {
  const rec: PriceOverrideRecord = {
    id: 'ovr-1',
    manufacturer: 'Test',
    model,
    basePricePhp: 1,
    overridePricePhp: price,
    justification: 'test',
    setBy: 'admin',
    setByEmail: 'admin@test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return new Map([[model, rec]]);
}

describe('validate: authoritative equipment pricing', () => {
  it('override price wins over the catalog price', () => {
    const overrides = overrideFor(sku.model, 999999);
    const { unitPrice, overridden } = resolveUnitPrice(sku.model, overrides, sku.unitPricePHP);
    expect(unitPrice).toBe(999999);
    expect(overridden).toBe(true);
  });

  it('falls back to the catalog price when no override exists', () => {
    const { unitPrice, overridden } = resolveUnitPrice(sku.model, new Map(), sku.unitPricePHP);
    expect(unitPrice).toBe(sku.unitPricePHP);
    expect(overridden).toBe(false);
  });

  it('manual selection of a real SKU IGNORES a spoofed client price', () => {
    const resolved = resolveManualSelection(
      { model: sku.model, unitPrice: 1, capacityBTU: 999999 }, // client tries to lie
      new Map(),
    );
    expect(resolved.custom).toBe(false);
    expect(resolved.unitPricePHP).toBe(sku.unitPricePHP); // catalog price, not client's 1
    expect(resolved.capacityBTU).toBe(sku.capacityBTU);   // catalog capacity, not 999999
  });

  it('manual selection of a real SKU applies an admin override', () => {
    const resolved = resolveManualSelection(
      { model: sku.model, unitPrice: 1 },
      overrideFor(sku.model, 123456),
    );
    expect(resolved.unitPricePHP).toBe(123456);
    expect(resolved.overridden).toBe(true);
  });

  it('a genuine off-catalog custom item honours the client price', () => {
    const resolved = resolveManualSelection(
      { model: 'NOT-A-REAL-SKU-xyz', unitPrice: 42000, capacityBTU: 18000, custom: true },
      new Map(),
    );
    expect(resolved.custom).toBe(true);
    expect(resolved.unitPricePHP).toBe(42000);
    expect(findCatalogEntryByModel('NOT-A-REAL-SKU-xyz')).toBeUndefined();
  });

  it('case-insensitive catalog lookup by model', () => {
    expect(findCatalogEntryByModel(sku.model.toLowerCase())?.model).toBe(sku.model);
  });
});
