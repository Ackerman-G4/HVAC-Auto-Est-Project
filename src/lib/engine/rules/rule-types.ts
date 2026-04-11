/**
 * Rules Engine Type Definitions
 *
 * All HVAC formulas and constants are stored as typed JSON rules,
 * making the system configurable without code changes.
 */

/** A formula rule evaluates a math expression with named variables */
export interface FormulaRule {
  id: string;
  name: string;
  category: RuleCategory;
  type: 'formula';
  /** Math expression string, e.g. "area * factor + occupants * 120" */
  formula: string;
  /** Default variable values used when not overridden by the caller */
  variables: Record<string, number>;
  /** Unit of the result (BTU/h, W, TR, m/s, etc.) */
  unit: string;
  description?: string;
}

/** A lookup rule maps keys to numeric values (single or nested) */
export interface LookupRule {
  id: string;
  name: string;
  category: RuleCategory;
  type: 'lookup';
  /** Flat or nested lookup table */
  table: Record<string, number | Record<string, number>>;
  /** Unit of the looked-up values */
  unit: string;
  description?: string;
}

/** A constants rule holds a bag of named numeric constants */
export interface ConstantsRule {
  id: string;
  name: string;
  category: RuleCategory;
  type: 'constants';
  /** Named constants */
  values: Record<string, number>;
  description?: string;
}

export type Rule = FormulaRule | LookupRule | ConstantsRule;

export type RuleCategory =
  | 'cooling_load'
  | 'equipment'
  | 'duct_sizing'
  | 'pricing'
  | 'psychrometric'
  | 'cfd';

export interface RuleSet {
  id: string;
  category: RuleCategory;
  version: number;
  updatedAt: string;
  rules: Rule[];
}

/** Result returned after evaluating a formula rule */
export interface RuleEvaluationResult {
  value: number;
  ruleId: string;
  formula: string;
  boundVariables: Record<string, number>;
}
