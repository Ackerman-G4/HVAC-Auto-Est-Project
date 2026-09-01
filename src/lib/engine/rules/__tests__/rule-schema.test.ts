import { describe, expect, it } from 'vitest';
import { parseRuleSet, RuleSetValidationError, ruleSetSchema } from '../rule-schema';
import { getAllBundledRuleSets, getAllCategories, getRuleSetSync } from '../rule-store';
import { constantFromRuleSet } from '../rule-evaluator';

/**
 * The rules layer is where every physical constant enters the engine.
 *
 * Until now the six bundled JSON files were asserted into `RuleSet` with
 * `as unknown as RuleSet`, so nothing checked that they matched the interface.
 * These tests cover both halves of the fix: that the real files are in fact
 * well-formed, and that a malformed one is rejected rather than reaching the
 * calculation path.
 */

/** A minimal well-formed rule set, used as the base for mutation. */
const validRuleSet = {
  id: 'test_rules',
  category: 'cooling_load' as const,
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  rules: [
    {
      id: 'cooling_load_constants',
      name: 'Cooling load constants',
      category: 'cooling_load' as const,
      type: 'constants' as const,
      values: { btu_per_tr: 12000, cfm_constant: 1.08 },
    },
  ],
};

describe('the bundled rule files the engine actually calculates with', () => {
  it('every shipped category parses against the schema', () => {
    // If this fails, a checked-in rules file has drifted from RuleSet and the
    // old `as unknown as` assertion would have let it through silently.
    for (const category of getAllCategories()) {
      expect(() => getRuleSetSync(category)).not.toThrow();
    }
  });

  it('ships all six categories, so seeding cannot persist a partial set', () => {
    const all = getAllBundledRuleSets();
    expect(Object.keys(all).sort()).toEqual([
      'cfd',
      'cooling_load',
      'duct_sizing',
      'equipment',
      'pricing',
      'psychrometric',
    ]);
  });

  it('carries the tonnage conversion CLAUDE.md §8.2 fixes at 12000 Btu/h', () => {
    // The value itself, not just its shape — this is the denominator of
    // trRequired and the reason the schema exists.
    const rules = getRuleSetSync('cooling_load');
    expect(constantFromRuleSet(rules, 'cooling_load_constants', 'btu_per_tr')).toBe(12000);
  });

  it('carries the sensible-heat coefficient 1.08 for standard air', () => {
    const rules = getRuleSetSync('cooling_load');
    expect(constantFromRuleSet(rules, 'cooling_load_constants', 'cfm_constant')).toBe(1.08);
  });
});

describe('a malformed rules file is rejected at the boundary', () => {
  it('accepts the well-formed baseline, so the rejections below mean something', () => {
    expect(() => parseRuleSet('test', validRuleSet)).not.toThrow();
  });

  it('rejects a constant that is zero-valued as a string rather than a number', () => {
    // The realistic typo: quoting a number in JSON. Previously this reached
    // `totalBtu / "12000"` territory with no complaint from the compiler.
    const broken = structuredClone(validRuleSet) as unknown as {
      rules: { values: Record<string, unknown> }[];
    };
    broken.rules[0]!.values.btu_per_tr = '12000';
    expect(() => parseRuleSet('test', broken)).toThrow(RuleSetValidationError);
  });

  it('rejects a non-finite constant, which would poison every downstream total', () => {
    const broken = structuredClone(validRuleSet);
    broken.rules[0]!.values.btu_per_tr = Number.NaN;
    expect(() => parseRuleSet('test', broken)).toThrow(RuleSetValidationError);
  });

  it('rejects an unrecognised rule type instead of matching it partially', () => {
    const broken = structuredClone(validRuleSet) as unknown as { rules: { type: string }[] };
    broken.rules[0]!.type = 'interpolation';
    expect(() => parseRuleSet('test', broken)).toThrow(RuleSetValidationError);
  });

  it('rejects a constants rule with no values bag', () => {
    const broken = structuredClone(validRuleSet) as unknown as {
      rules: { values?: unknown }[];
    };
    delete broken.rules[0]!.values;
    expect(() => parseRuleSet('test', broken)).toThrow(RuleSetValidationError);
  });

  it('rejects a category outside the six the engine knows', () => {
    const broken = { ...validRuleSet, category: 'refrigeration' };
    expect(() => parseRuleSet('test', broken)).toThrow(RuleSetValidationError);
  });

  it('names the source and the failing path, so the file can be found', () => {
    const broken = structuredClone(validRuleSet);
    broken.rules[0]!.values.btu_per_tr = Number.POSITIVE_INFINITY;

    try {
      parseRuleSet('cooling_load (bundled)', broken);
      expect.unreachable('expected a RuleSetValidationError');
    } catch (error) {
      expect(error).toBeInstanceOf(RuleSetValidationError);
      const validationError = error as RuleSetValidationError;
      expect(validationError.source).toBe('cooling_load (bundled)');
      expect(validationError.issues.join(' ')).toContain('btu_per_tr');
    }
  });
});

describe('the schema admits the shapes the real files use', () => {
  it('accepts a nested lookup table, not only a flat one', () => {
    const nested = {
      ...validRuleSet,
      rules: [
        {
          id: 'envelope_btu_per_m2',
          name: 'Envelope load by space type',
          category: 'cooling_load' as const,
          type: 'lookup' as const,
          table: { office: 120, server_room: { low: 400, high: 900 } },
          unit: 'BTU/h/m2',
        },
      ],
    };
    expect(ruleSetSchema.safeParse(nested).success).toBe(true);
  });

  it('accepts a formula rule with its default variable bindings', () => {
    const formula = {
      ...validRuleSet,
      rules: [
        {
          id: 'sensible_heat',
          name: 'Sensible heat',
          category: 'cooling_load' as const,
          type: 'formula' as const,
          formula: 'cfm_constant * cfm * delta_t',
          variables: { cfm_constant: 1.08, cfm: 0, delta_t: 0 },
          unit: 'BTU/h',
        },
      ],
    };
    expect(ruleSetSchema.safeParse(formula).success).toBe(true);
  });
});
