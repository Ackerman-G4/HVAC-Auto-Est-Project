/**
 * BOQ Integrity Engine
 * Canonical SHA-256 hashing over BOQ items for tamper-evident locking.
 * Both the snapshot writer and the verifier must use the same
 * field picker + serialization so hashes stay comparable.
 */

import { createHash } from 'node:crypto';

export interface BoqIntegrityFields {
  section: string;
  description: string;
  quantity: number;
  unit: string;
  finalUnitPrice: number;
  finalTotalPrice: number;
  category: string;
}

export type BoqVerificationStatus = 'verified' | 'tampered' | 'no_snapshot' | 'empty';

export interface BoqVerificationSnapshot {
  boqHash: string;
  createdAt: string;
  grandTotalPhp: number;
  itemCount: number;
  deltaPhp: number;
}

export interface BoqVerificationResult {
  status: BoqVerificationStatus;
  boqHash: string;
  snapshotHash: string | null;
  lockedAt: string | null;
  grandTotalPhp: number | null;
  itemCount: number | null;
  deltaPhp: number | null;
}

export interface BoqPricingRates {
  overheadPercent: number;
  contingencyPercent: number;
  vatRate: number;
}

function roundTo2dp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function pickBoqIntegrityFields(item: BoqIntegrityFields): BoqIntegrityFields {
  return {
    section: item.section,
    description: item.description,
    quantity: roundTo2dp(item.quantity),
    unit: item.unit,
    finalUnitPrice: roundTo2dp(item.finalUnitPrice),
    finalTotalPrice: roundTo2dp(item.finalTotalPrice),
    category: item.category,
  };
}

export function computeBoqHash(items: BoqIntegrityFields[]): string {
  const canonical = items
    .map(pickBoqIntegrityFields)
    .sort((a, b) => compareStrings(a.section, b.section) || compareStrings(a.description, b.description))
    .map((item) => [
      item.section,
      item.description,
      item.quantity,
      item.unit,
      item.finalUnitPrice,
      item.finalTotalPrice,
      item.category,
    ]);

  const serialized = JSON.stringify([canonical.length, canonical]);
  return createHash('sha256').update(serialized).digest('hex');
}

export function computeBoqGrandTotal(items: BoqIntegrityFields[], rates: BoqPricingRates): number {
  const subtotal = items.reduce(
    (sum, item) => sum + (Number.isFinite(item.finalTotalPrice) ? item.finalTotalPrice : 0),
    0,
  );
  const overhead = subtotal * rates.overheadPercent;
  const contingency = subtotal * rates.contingencyPercent;
  const beforeVAT = subtotal + overhead + contingency;
  const vat = beforeVAT * rates.vatRate;
  return Math.round(beforeVAT + vat);
}

export function buildBoqVerification(
  items: BoqIntegrityFields[],
  snapshot: BoqVerificationSnapshot | null,
): BoqVerificationResult {
  const boqHash = computeBoqHash(items);

  if (!snapshot) {
    return {
      status: items.length === 0 ? 'empty' : 'no_snapshot',
      boqHash,
      snapshotHash: null,
      lockedAt: null,
      grandTotalPhp: null,
      itemCount: null,
      deltaPhp: null,
    };
  }

  return {
    status: boqHash === snapshot.boqHash ? 'verified' : 'tampered',
    boqHash,
    snapshotHash: snapshot.boqHash,
    lockedAt: snapshot.createdAt,
    grandTotalPhp: snapshot.grandTotalPhp,
    itemCount: snapshot.itemCount,
    deltaPhp: snapshot.deltaPhp,
  };
}
