/**
 * Runtime validation for rule sets.
 *
 * Mechanism: `RuleSet` and its members in `rule-types.ts` are compile-time-only
 * interfaces. The bundled JSON files were entering the engine through
 * `json as unknown as RuleSet` — a double assertion, which tells the compiler
 * the shape conforms without checking that it does. That is the same escape
 * hatch `any` provides, and it sits directly upstream of every physical
 * constant the calculation engine uses.
 *
 * The consequence is specific, not theoretical. `btu_per_tr` is read out of
 * `cooling-load-rules.json` and used as the denominator of
 * `trRequired = totalBtuAfterFactors / btuPerTr`. A typo that makes it `0`, a
 * string, or a renamed key compiles, lints, and passes every existing test —
 * then yields `Infinity` or `NaN` tons of refrigeration, which multiplies
 * through equipment quantity into the bill of quantities total (CLAUDE.md §8.4).
 *
 * Parsing the JSON through these schemas moves that failure to the boundary,
 * where it names the file and the offending path, and makes it impossible to
 * ship a malformed rules file past the test suite.
 */

import { z } from 'zod';
import type { RuleSet } from './rule-types';

/**
 * Every numeric in a rule set is a physical quantity, a coefficient or a
 * price. `z.number()` alone admits `NaN` and both infinities; `.finite()`
 * is what actually excludes them.
 */
const finiteNumber = z.number().finite();

const ruleCategorySchema = z.enum([
  'cooling_load',
  'equipment',
  'duct_sizing',
  'pricing',
  'psychrometric',
  'cfd',
]);

/** Fields shared by all three rule variants. */
const ruleBase = {
  id: z.string().min(1),
  name: z.string().min(1),
  category: ruleCategorySchema,
  description: z.string().optional(),
};

const formulaRuleSchema = z.object({
  ...ruleBase,
  type: z.literal('formula'),
  formula: z.string().min(1),
  variables: z.record(z.string(), finiteNumber),
  unit: z.string(),
});

const lookupRuleSchema = z.object({
  ...ruleBase,
  type: z.literal('lookup'),
  // Flat or one level nested, matching LookupRule.
  table: z.record(z.string(), z.union([finiteNumber, z.record(z.string(), finiteNumber)])),
  unit: z.string(),
});

const constantsRuleSchema = z.object({
  ...ruleBase,
  type: z.literal('constants'),
  values: z.record(z.string(), finiteNumber),
});

/**
 * Discriminated on `type`, so a rule with an unrecognised type is rejected
 * outright rather than falling through to a partial match on another variant.
 */
export const ruleSchema = z.discriminatedUnion('type', [
  formulaRuleSchema,
  lookupRuleSchema,
  constantsRuleSchema,
]);

export const ruleSetSchema = z.object({
  id: z.string().min(1),
  category: ruleCategorySchema,
  version: finiteNumber,
  updatedAt: z.string().min(1),
  rules: z.array(ruleSchema),
});

/** Raised when a rule set fails validation. Names the source and the path. */
export class RuleSetValidationError extends Error {
  readonly source: string;
  /** Zod issue paths, e.g. `rules.3.values.btu_per_tr`. */
  readonly issues: string[];

  constructor(source: string, issues: string[]) {
    super(`Rule set "${source}" is invalid: ${issues.join('; ')}`);
    this.name = 'RuleSetValidationError';
    this.source = source;
    this.issues = issues;
  }
}

/**
 * Validate an unknown value as a RuleSet.
 *
 * Throws rather than returning a fallback. A rules file is checked into the
 * repository, so a failure here is a build-time defect that surfaces in dev or
 * CI — never a runtime surprise for a user — and substituting a default would
 * mean calculating with constants nobody chose.
 *
 * @param source identifies the file or document, for the error message
 */
export function parseRuleSet(source: string, value: unknown): RuleSet {
  const result = ruleSetSchema.safeParse(value);

  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
    throw new RuleSetValidationError(source, issues);
  }

  return result.data;
}
