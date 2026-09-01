/**
 * Rules Engine — Rule Store
 *
 * Provides access to rule sets with a layered strategy:
 * 1. In-memory cache (fastest)
 * 2. Bundled JSON fallback (works offline / no Firestore)
 *
 * The Firestore layer named in earlier revisions of this comment was removed
 * when `firebase-admin` was pulled out to keep the module client-safe (see the
 * note above `getRuleSet`). There is no write path into the cache other than
 * the bundled files, so every constant the engine reads is checked into the
 * repository.
 *
 * Those files are still validated on load. `RuleSet` is a compile-time
 * interface and the JSON imports were previously asserted into it with
 * `as unknown as RuleSet`, which checks nothing; see `rule-schema.ts` for what
 * that costs on the money path.
 */

import type { RuleSet, RuleCategory } from './rule-types';
import { parseRuleSet } from './rule-schema';

// ─── Bundled Defaults (JSON imports) ──────────────────────────────
import coolingLoadRules from '@/constants/rules/cooling-load-rules.json';
import equipmentRules from '@/constants/rules/equipment-rules.json';
import ductSizingRules from '@/constants/rules/duct-sizing-rules.json';
import pricingRules from '@/constants/rules/pricing-rules.json';
import psychrometricRules from '@/constants/rules/psychrometric-rules.json';
import cfdRules from '@/constants/rules/cfd-rules.json';

/**
 * The raw JSON imports, held as `unknown` so nothing can read them without
 * going through `parseRuleSet` first.
 */
/** The categories the engine ships rules for, in a stable order. */
const RULE_CATEGORIES: readonly RuleCategory[] = [
  'cooling_load',
  'equipment',
  'duct_sizing',
  'pricing',
  'psychrometric',
  'cfd',
];

const BUNDLED_JSON: Record<RuleCategory, unknown> = {
  cooling_load: coolingLoadRules,
  equipment: equipmentRules,
  duct_sizing: ductSizingRules,
  pricing: pricingRules,
  psychrometric: psychrometricRules,
  cfd: cfdRules,
};

/**
 * Validated bundled rule sets, parsed once per category.
 *
 * Separate from the TTL cache below: bundled rules are static, so re-parsing
 * them every five minutes would buy nothing. This memo is never invalidated.
 */
const validatedBundled = new Map<RuleCategory, RuleSet>();

/**
 * Parse and memoise a bundled rule set.
 *
 * Throws `RuleSetValidationError` if the file is malformed. That is deliberate:
 * these files are checked in, so the failure belongs in dev or CI, and there is
 * no meaningful fallback — calculating with substituted constants would produce
 * a plausible wrong number instead of a visible error.
 */
function getBundled(category: RuleCategory): RuleSet | null {
  const memo = validatedBundled.get(category);
  if (memo) return memo;

  const raw = BUNDLED_JSON[category];
  if (raw === undefined) return null;

  const parsed = parseRuleSet(`${category} (bundled)`, raw);
  validatedBundled.set(category, parsed);
  return parsed;
}

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
  const bundled = getBundled(category);
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

  const bundled = getBundled(category);
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
  return [...RULE_CATEGORIES];
}

/**
 * Get all bundled rule sets (for seeding Firestore).
 *
 * Every category is validated here rather than lazily, because the caller is
 * about to persist these. Seeding a store with a rule set that would later be
 * rejected on read is a defect worth catching at the point of write.
 */
export function getAllBundledRuleSets(): Record<RuleCategory, RuleSet> {
  const entries = RULE_CATEGORIES.map((category) => {
    const ruleSet = getBundled(category);
    if (!ruleSet) {
      throw new Error(`No bundled rule set found for category "${category}"`);
    }
    return [category, ruleSet] as const;
  });

  return Object.fromEntries(entries) as Record<RuleCategory, RuleSet>;
}
