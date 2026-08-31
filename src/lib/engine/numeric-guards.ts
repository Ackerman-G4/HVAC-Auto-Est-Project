/**
 * Guarded arithmetic for the calculation engine.
 *
 * Mechanism: IEEE 754 division by zero yields `Infinity` rather than raising.
 * `Infinity` then survives `Math.ceil` and `Math.max`, multiplies cleanly
 * through a price, and lands in a currency total with no error raised anywhere
 * in the stack. A single catalogue record carrying `capacityTr: 0` is enough.
 *
 * The correction has to be at the point of division. A downstream sanity check
 * cannot distinguish a corrupt total from a genuinely large one, and clamping —
 * `Math.max(0.1, providedTr)` was doing exactly this — converts a detectable
 * fault into a plausible wrong number, which is strictly worse.
 *
 * These throw rather than returning a fallback. That is the intended trade
 * (REMEDIATION_PLAN.md §4): some inputs that currently produce a wrong figure
 * will start producing an error. A visible failure in a cost estimate is
 * recoverable; a wrong currency figure delivered to a client is not.
 */

/** Thrown when an input cannot produce a meaningful result. */
export class CalculationError extends Error {
  /** Machine-readable, for callers mapping to a status or a UI message. */
  readonly code: string;
  /** Where it happened, e.g. `equipmentQuantity` or `pricing.unitTotal`. */
  readonly context: string;
  /** The offending value, when there is a single one worth reporting. */
  readonly value?: number | undefined;

  constructor(message: string, context: string, code = 'CALCULATION_ERROR', value?: number) {
    super(message);
    this.name = 'CalculationError';
    this.code = code;
    this.context = context;
    this.value = value;
  }
}

export interface DivideOptions {
  /**
   * Reject a negative denominator. Set where physics or commerce forbids it —
   * a capacity, an area, a duration. Left off where a negative denominator is
   * meaningful, such as a temperature difference that may run either way.
   */
  requirePositive?: boolean;
  /** Overrides the default `CALCULATION_ERROR` code. */
  code?: string;
}

/**
 * Assert a value is a usable finite number.
 *
 * `NaN` is the quieter half of this problem: it propagates through every
 * subsequent operation and through `Math.max`, so a single poisoned input
 * silently voids an entire aggregate.
 *
 * @param value the value to check
 * @param context where it came from, for the error message
 */
export function assertFinite(
  value: number,
  context: string,
  code = 'NON_FINITE_VALUE',
): number {
  if (!Number.isFinite(value)) {
    throw new CalculationError(
      `${context}: expected a finite number, received ${describe(value)}.`,
      context,
      code,
      value,
    );
  }
  return value;
}

/** Assert a value is finite and strictly greater than zero. */
export function assertPositive(
  value: number,
  context: string,
  code = 'NON_POSITIVE_VALUE',
): number {
  assertFinite(value, context, code);
  if (value <= 0) {
    throw new CalculationError(
      `${context}: expected a value greater than zero, received ${value}.`,
      context,
      code,
      value,
    );
  }
  return value;
}

/**
 * Divide, refusing to produce `Infinity` or `NaN`.
 *
 * @param numerator dividend
 * @param denominator divisor — the value this guard exists for
 * @param context where the division happens, for the error message
 */
export function safeDivide(
  numerator: number,
  denominator: number,
  context: string,
  options: DivideOptions = {},
): number {
  const { requirePositive = false, code } = options;

  assertFinite(numerator, `${context} (numerator)`, code ?? 'NON_FINITE_NUMERATOR');
  assertFinite(denominator, `${context} (denominator)`, code ?? 'NON_FINITE_DENOMINATOR');

  if (denominator === 0) {
    throw new CalculationError(
      `${context}: division by zero.`,
      context,
      code ?? 'DIVISION_BY_ZERO',
      denominator,
    );
  }

  if (requirePositive && denominator < 0) {
    throw new CalculationError(
      `${context}: denominator must be positive, received ${denominator}.`,
      context,
      code ?? 'NEGATIVE_DENOMINATOR',
      denominator,
    );
  }

  return numerator / denominator;
}

/** `-0`, `NaN` and the infinities read badly via template interpolation. */
function describe(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  return String(value);
}
