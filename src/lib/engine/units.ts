/**
 * Unit conversion, in one place.
 *
 * CLAUDE.md §5: conversion happens only inside a named function, and inline
 * multiplication by a magic factor is rejected. The reason is not tidiness —
 * a wrong coefficient buried in an expression is invisible to review and to the
 * compiler, and the resulting number is plausible rather than obviously broken.
 * `capacityBTU * 0.000293` reads fine whether the constant is right or not.
 *
 * Every coefficient below states its source. `Number.EPSILON`-level precision
 * is deliberate: rounding a conversion factor to three digits shifts a tonnage
 * figure by enough to change an equipment selection at the margin.
 *
 * These are pure conversions and perform no validation. A caller converting a
 * value that must also be positive or finite should pair them with the guards
 * in `numeric-guards.ts` — conversion and validation are separate concerns, and
 * folding them together would make a converter that throws in some contexts and
 * not others.
 */

// ── Coefficients ─────────────────────────────────────────────
//
// Declared once, each with its provenance. Nothing outside this module should
// contain these numbers.

/** CLAUDE.md §8.2. Exact by definition of the ton of refrigeration. */
const BTU_PER_HOUR_PER_TON = 12_000;

/** 1 W = 3.412142 Btu/h. Derived from 1 Btu = 1055.05585262 J exactly. */
const BTU_PER_HOUR_PER_WATT = 3.412142;

/** 1 m² = 10.763910417 ft². Derived from 1 ft = 0.3048 m exactly. */
const SQUARE_FEET_PER_SQUARE_METRE = 10.763910417;

/**
 * A temperature *difference* of 1 °C equals 1.8 °F.
 *
 * Only ever applied to a difference. Converting an absolute temperature needs
 * the +32 offset, which is why that conversion is a separate function below —
 * applying this factor to an absolute reading is the classic silent error.
 */
const FAHRENHEIT_PER_CELSIUS_DEGREE = 1.8;

/** 1 L/s = 2.118880003 CFM. Derived from 1 ft³ = 28.316846592 L exactly. */
const CFM_PER_LITRE_PER_SECOND = 2.118880003;

// ── Cooling capacity ─────────────────────────────────────────

/** Tons of refrigeration → Btu/h. */
export function tonsToBtuPerHour(tons: number): number {
  return tons * BTU_PER_HOUR_PER_TON;
}

/** Btu/h → tons of refrigeration. */
export function btuPerHourToTons(btuPerHour: number): number {
  return btuPerHour / BTU_PER_HOUR_PER_TON;
}

// ── Power and heat ───────────────────────────────────────────

/** Watts → Btu/h. */
export function wattsToBtuPerHour(watts: number): number {
  return watts * BTU_PER_HOUR_PER_WATT;
}

/** Btu/h → watts. */
export function btuPerHourToWatts(btuPerHour: number): number {
  return btuPerHour / BTU_PER_HOUR_PER_WATT;
}

/**
 * Btu/h → kilowatts.
 *
 * Replaces an inline `* 0.000293`. That constant is low by 0.024% — 10.5480 kW
 * against 10.5506 kW on a 3 TR unit. Small, and worth stating plainly: the
 * reason for this function is single definition (CLAUDE.md §5), not that the
 * old number was materially wrong.
 */
export function btuPerHourToKilowatts(btuPerHour: number): number {
  return btuPerHourToWatts(btuPerHour) / 1000;
}

/** Kilowatts → Btu/h. */
export function kilowattsToBtuPerHour(kilowatts: number): number {
  return wattsToBtuPerHour(kilowatts * 1000);
}

// ── Area ─────────────────────────────────────────────────────

export function squareMetresToSquareFeet(squareMetres: number): number {
  return squareMetres * SQUARE_FEET_PER_SQUARE_METRE;
}

export function squareFeetToSquareMetres(squareFeet: number): number {
  return squareFeet / SQUARE_FEET_PER_SQUARE_METRE;
}

// ── Temperature ──────────────────────────────────────────────

/**
 * A temperature *difference* in °C → the same difference in °F.
 *
 * No +32 offset: a difference has no origin. Named `Delta` so a call site
 * converting an absolute reading with it looks wrong on sight.
 */
export function celsiusDeltaToFahrenheitDelta(deltaC: number): number {
  return deltaC * FAHRENHEIT_PER_CELSIUS_DEGREE;
}

/** A temperature *difference* in °F → °C. */
export function fahrenheitDeltaToCelsiusDelta(deltaF: number): number {
  return deltaF / FAHRENHEIT_PER_CELSIUS_DEGREE;
}

/** An absolute temperature in °C → °F. Includes the offset. */
export function celsiusToFahrenheit(celsius: number): number {
  return celsius * FAHRENHEIT_PER_CELSIUS_DEGREE + 32;
}

/** An absolute temperature in °F → °C. */
export function fahrenheitToCelsius(fahrenheit: number): number {
  return (fahrenheit - 32) / FAHRENHEIT_PER_CELSIUS_DEGREE;
}

// ── Airflow ──────────────────────────────────────────────────

export function litresPerSecondToCfm(litresPerSecond: number): number {
  return litresPerSecond * CFM_PER_LITRE_PER_SECOND;
}

export function cfmToLitresPerSecond(cfm: number): number {
  return cfm / CFM_PER_LITRE_PER_SECOND;
}
