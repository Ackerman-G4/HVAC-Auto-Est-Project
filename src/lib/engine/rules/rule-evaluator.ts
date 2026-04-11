/**
 * Rules Engine — Safe Expression Evaluator
 *
 * Uses mathjs for safe mathematical expression evaluation.
 * NO eval() — all formulas are parsed and evaluated in a sandboxed scope.
 * Only whitelisted math functions are available.
 */

import {
  create,
  absDependencies,
  ceilDependencies,
  floorDependencies,
  roundDependencies,
  sqrtDependencies,
  cbrtDependencies,
  powDependencies,
  minDependencies,
  maxDependencies,
  logDependencies,
  log10Dependencies,
  expDependencies,
  sinDependencies,
  cosDependencies,
  tanDependencies,
  asinDependencies,
  acosDependencies,
  atanDependencies,
  atan2Dependencies,
  piDependencies,
  eDependencies,
  addDependencies,
  subtractDependencies,
  multiplyDependencies,
  divideDependencies,
  modDependencies,
  unaryMinusDependencies,
  parseDependencies,
  evaluateDependencies,
  type MathJsInstance,
} from 'mathjs';
import type {
  Rule,
  FormulaRule,
  LookupRule,
  ConstantsRule,
  RuleSet,
  RuleCategory,
  RuleEvaluationResult,
} from './rule-types';

// Create a restricted mathjs instance with ONLY whitelisted functions
const math: MathJsInstance = create({
  absDependencies,
  ceilDependencies,
  floorDependencies,
  roundDependencies,
  sqrtDependencies,
  cbrtDependencies,
  powDependencies,
  minDependencies,
  maxDependencies,
  logDependencies,
  log10Dependencies,
  expDependencies,
  sinDependencies,
  cosDependencies,
  tanDependencies,
  asinDependencies,
  acosDependencies,
  atanDependencies,
  atan2Dependencies,
  piDependencies,
  eDependencies,
  addDependencies,
  subtractDependencies,
  multiplyDependencies,
  divideDependencies,
  modDependencies,
  unaryMinusDependencies,
  parseDependencies,
  evaluateDependencies,
}) as MathJsInstance;

// Safe functions list (for reference / external validation)
const ALLOWED_FUNCTIONS = new Set([
  'abs', 'ceil', 'floor', 'round', 'sqrt', 'cbrt', 'pow',
  'min', 'max', 'log', 'log10', 'exp',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'pi', 'e',
]);

/**
 * Evaluate a formula string with the given variable bindings.
 * Throws if any referenced variable is unbound or if the formula is invalid.
 */
export function evaluateFormula(
  formula: string,
  variables: Record<string, number>,
): number {
  try {
    const result = math.evaluate(formula, { ...variables });
    if (typeof result !== 'number' || !Number.isFinite(result)) {
      throw new Error(`Formula "${formula}" produced non-finite result: ${result}`);
    }
    return result;
  } catch (err) {
    throw new Error(
      `Rule evaluation failed for formula "${formula}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

/**
 * Evaluate a FormulaRule, merging caller-provided variables with defaults.
 * Variables provided by the caller override the rule's default values.
 */
export function evaluateFormulaRule(
  rule: FormulaRule,
  inputVariables: Record<string, number> = {},
): RuleEvaluationResult {
  const boundVariables = { ...rule.variables, ...inputVariables };
  const value = evaluateFormula(rule.formula, boundVariables);
  return {
    value,
    ruleId: rule.id,
    formula: rule.formula,
    boundVariables,
  };
}

/**
 * Look up a value from a LookupRule table.
 * Supports flat lookups (key → number) and nested lookups (key → key → number).
 */
export function evaluateLookup(
  rule: LookupRule,
  key: string,
  subKey?: string,
): number {
  const entry = rule.table[key];
  if (entry === undefined) {
    throw new Error(`Lookup rule "${rule.id}": key "${key}" not found in table`);
  }
  if (typeof entry === 'number') {
    return entry;
  }
  if (subKey === undefined) {
    throw new Error(
      `Lookup rule "${rule.id}": key "${key}" is a nested table but no subKey was provided`
    );
  }
  const subEntry = entry[subKey];
  if (subEntry === undefined) {
    throw new Error(
      `Lookup rule "${rule.id}": subKey "${subKey}" not found under key "${key}"`
    );
  }
  return subEntry;
}

/**
 * Get a constant value from a ConstantsRule.
 */
export function getConstant(rule: ConstantsRule, name: string): number {
  const value = rule.values[name];
  if (value === undefined) {
    throw new Error(`Constants rule "${rule.id}": constant "${name}" not found`);
  }
  return value;
}

// ─── RuleSet Helpers ──────────────────────────────────────────

/**
 * Find a rule by ID within a RuleSet.
 */
export function findRule(ruleSet: RuleSet, ruleId: string): Rule | undefined {
  return ruleSet.rules.find((r) => r.id === ruleId);
}

/**
 * Find a FormulaRule by ID (type-safe).
 */
export function findFormulaRule(ruleSet: RuleSet, ruleId: string): FormulaRule | undefined {
  const rule = findRule(ruleSet, ruleId);
  return rule?.type === 'formula' ? rule : undefined;
}

/**
 * Find a LookupRule by ID (type-safe).
 */
export function findLookupRule(ruleSet: RuleSet, ruleId: string): LookupRule | undefined {
  const rule = findRule(ruleSet, ruleId);
  return rule?.type === 'lookup' ? rule : undefined;
}

/**
 * Find a ConstantsRule by ID (type-safe).
 */
export function findConstantsRule(ruleSet: RuleSet, ruleId: string): ConstantsRule | undefined {
  const rule = findRule(ruleSet, ruleId);
  return rule?.type === 'constants' ? rule : undefined;
}

/**
 * Convenience: evaluate a formula rule by ID from a RuleSet.
 */
export function evaluateFromRuleSet(
  ruleSet: RuleSet,
  ruleId: string,
  variables: Record<string, number> = {},
): RuleEvaluationResult {
  const rule = findFormulaRule(ruleSet, ruleId);
  if (!rule) {
    throw new Error(`FormulaRule "${ruleId}" not found in RuleSet "${ruleSet.id}"`);
  }
  return evaluateFormulaRule(rule, variables);
}

/**
 * Convenience: lookup a value by ID from a RuleSet.
 */
export function lookupFromRuleSet(
  ruleSet: RuleSet,
  ruleId: string,
  key: string,
  subKey?: string,
): number {
  const rule = findLookupRule(ruleSet, ruleId);
  if (!rule) {
    throw new Error(`LookupRule "${ruleId}" not found in RuleSet "${ruleSet.id}"`);
  }
  return evaluateLookup(rule, key, subKey);
}

/**
 * Convenience: get a constant by ID from a RuleSet.
 */
export function constantFromRuleSet(
  ruleSet: RuleSet,
  ruleId: string,
  name: string,
): number {
  const rule = findConstantsRule(ruleSet, ruleId);
  if (!rule) {
    throw new Error(`ConstantsRule "${ruleId}" not found in RuleSet "${ruleSet.id}"`);
  }
  return getConstant(rule, name);
}
