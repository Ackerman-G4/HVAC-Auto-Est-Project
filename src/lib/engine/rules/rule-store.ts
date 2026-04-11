/**
 * Rules Engine — Rule Store
 *
 * Provides access to rule sets with a layered strategy:
 * 1. In-memory cache (fastest)
 * 2. Firestore `rules/` collection (admin-editable)
 * 3. Bundled JSON fallback (works offline / no Firestore)
 */

import type { RuleSet, RuleCategory } from './rule-types';

// ─── Bundled Defaults (JSON imports) ──────────────────────────────
import coolingLoadRules from '@/constants/rules/cooling-load-rules.json';
import equipmentRules from '@/constants/rules/equipment-rules.json';
import ductSizingRules from '@/constants/rules/duct-sizing-rules.json';
import pricingRules from '@/constants/rules/pricing-rules.json';
import psychrometricRules from '@/constants/rules/psychrometric-rules.json';
import cfdRules from '@/constants/rules/cfd-rules.json';

const BUNDLED_RULES: Record<RuleCategory, RuleSet> = {
  cooling_load: coolingLoadRules as unknown as RuleSet,
  equipment: equipmentRules as unknown as RuleSet,
  duct_sizing: ductSizingRules as unknown as RuleSet,
  pricing: pricingRules as unknown as RuleSet,
  psychrometric: psychrometricRules as unknown as RuleSet,
  cfd: cfdRules as unknown as RuleSet,
};

// ─── In-Memory Cache ──────────────────────────────────────────────

interface CacheEntry {
  ruleSet: RuleSet;
  fetchedAt: number;
}

const cache = new Map<RuleCategory, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(category: RuleCategory): RuleSet | null {
  const entry = cache.get(category);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(category);
    return null;
  }
  return entry.ruleSet;
}

function setCache(category: RuleCategory, ruleSet: RuleSet): void {
  cache.set(category, { ruleSet, fetchedAt: Date.now() });
}

// ─── Firestore Fetch (server-side only) ───────────────────────────
// NOTE: firebase-admin import was removed to prevent it from leaking into
// the client bundle. If Firestore-based rule overrides are needed, call
// the /api/settings endpoint instead which runs server-side.

// ─── Public API ───────────────────────────────────────────────────

/**
 * Get a RuleSet by category.
 * Resolution order: cache → bundled JSON fallback.
 * (Firestore fetch removed to keep this module client-safe.)
 */
export async function getRuleSet(category: RuleCategory): Promise<RuleSet> {
  // 1. Cache hit
  const cached = getCached(category);
  if (cached) return cached;

  // 2. Bundled fallback
  const bundled = BUNDLED_RULES[category];
  if (bundled) {
    setCache(category, bundled);
    return bundled;
  }

  throw new Error(`No rule set found for category "${category}"`);
}

/**
 * Get a RuleSet synchronously (bundled fallback only, no Firestore).
 * Use this in client-side code or when async is not viable.
 */
export function getRuleSetSync(category: RuleCategory): RuleSet {
  const cached = getCached(category);
  if (cached) return cached;

  const bundled = BUNDLED_RULES[category];
  if (bundled) {
    setCache(category, bundled);
    return bundled;
  }

  throw new Error(`No rule set found for category "${category}"`);
}

/**
 * Invalidate the cache for a specific category or all categories.
 */
export function invalidateRuleCache(category?: RuleCategory): void {
  if (category) {
    cache.delete(category);
  } else {
    cache.clear();
  }
}

/**
 * Get all bundled rule categories.
 */
export function getAllCategories(): RuleCategory[] {
  return Object.keys(BUNDLED_RULES) as RuleCategory[];
}

/**
 * Get all bundled rule sets (for seeding Firestore).
 */
export function getAllBundledRuleSets(): Record<RuleCategory, RuleSet> {
  return { ...BUNDLED_RULES };
}
