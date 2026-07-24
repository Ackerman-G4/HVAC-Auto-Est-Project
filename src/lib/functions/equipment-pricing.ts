/**
 * Authoritative equipment pricing (Wave 8 money-path repair).
 *
 * Two rules make quotes trustworthy:
 *   1. Admin price overrides win over the catalog price (they were invisible to
 *      sizing/quotes before Wave 8 — a display-only layer).
 *   2. For a real catalog SKU, price + capacity are resolved SERVER-SIDE from the
 *      catalog, never trusted from the client request body (the manual-selection
 *      endpoint previously stored whatever `unitPrice`/`capacityBTU` the client
 *      sent, so a BOQ-hash-verified but wrong total was possible).
 */

import { EQUIPMENT_CATALOG } from '@/constants/equipment-catalog';
import type { PriceOverrideRecord } from '@/lib/firebase/price-override-store';

export type CatalogEntry = typeof EQUIPMENT_CATALOG[number];

/** Find a catalog SKU by model (trimmed, case-insensitive). */
export function findCatalogEntryByModel(model: string | undefined | null): CatalogEntry | undefined {
  if (!model) return undefined;
  const key = model.trim().toLowerCase();
  if (!key) return undefined;
  return EQUIPMENT_CATALOG.find((e) => e.model.trim().toLowerCase() === key);
}

/**
 * Resolve the authoritative unit price for a model: an admin override wins,
 * otherwise the supplied catalog price. Override lookup is by exact model key,
 * matching the price-override store and the catalog-browse endpoint.
 */
export function resolveUnitPrice(
  model: string,
  overrides: Map<string, PriceOverrideRecord>,
  fallbackCatalogPrice: number,
): { unitPrice: number; overridden: boolean } {
  const override = overrides.get(model);
  if (override) {
    return { unitPrice: override.overridePricePhp, overridden: true };
  }
  return { unitPrice: fallbackCatalogPrice, overridden: false };
}

export interface ResolvedEquipmentPricing {
  manufacturer: string;
  model: string;
  type: string;
  capacityTR: number;
  capacityBTU: number;
  capacityKW: number;
  eer: number;
  refrigerant: string;
  unitPricePHP: number;
  overridden: boolean;
  /** True when the model was NOT found in the catalog (a genuine custom item). */
  custom: boolean;
}

export interface ManualSelectionInput {
  model?: string;
  brand?: string;
  type?: string;
  capacityBTU?: number;
  capacityTR?: number;
  eer?: number;
  refrigerant?: string;
  /** Client-supplied price — honoured ONLY for genuine off-catalog custom items. */
  unitPrice?: number;
  /** Explicit opt-in for a custom (off-catalog) line item. */
  custom?: boolean;
}

/**
 * Resolve a manual equipment selection into an authoritative record. If the
 * model matches a catalog SKU, price + capacity come from the catalog (then any
 * admin override); the client's `unitPrice`/`capacityBTU` are ignored. Only when
 * the item is genuinely off-catalog (unknown model, or `custom: true`) is the
 * client price accepted.
 */
export function resolveManualSelection(
  input: ManualSelectionInput,
  overrides: Map<string, PriceOverrideRecord>,
): ResolvedEquipmentPricing {
  const entry = input.custom ? undefined : findCatalogEntryByModel(input.model);

  if (entry) {
    const { unitPrice, overridden } = resolveUnitPrice(entry.model, overrides, entry.unitPricePHP);
    return {
      manufacturer: entry.manufacturer,
      model: entry.model,
      type: entry.type,
      capacityTR: entry.capacityTR,
      capacityBTU: entry.capacityBTU,
      capacityKW: entry.capacityKW,
      eer: entry.eer,
      refrigerant: entry.refrigerant,
      unitPricePHP: unitPrice,
      overridden,
      custom: false,
    };
  }

  // Genuine off-catalog custom item — client values are the only source.
  const capacityBTU = input.capacityBTU || 0;
  return {
    manufacturer: input.brand || '',
    model: input.model || '',
    type: input.type || 'wall_split',
    capacityTR: input.capacityTR || (capacityBTU ? capacityBTU / 12000 : 0),
    capacityBTU,
    capacityKW: capacityBTU * 0.000293,
    eer: input.eer || 10,
    refrigerant: input.refrigerant || 'R32',
    unitPricePHP: input.unitPrice || 0,
    overridden: false,
    custom: true,
  };
}
