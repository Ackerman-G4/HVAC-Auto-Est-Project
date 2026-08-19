import { describe, expect, it } from 'vitest';
import {
  tonsToBtuPerHour,
  btuPerHourToTons,
  wattsToBtuPerHour,
  btuPerHourToWatts,
  btuPerHourToKilowatts,
  kilowattsToBtuPerHour,
  squareMetresToSquareFeet,
  squareFeetToSquareMetres,
  celsiusDeltaToFahrenheitDelta,
  fahrenheitDeltaToCelsiusDelta,
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  litresPerSecondToCfm,
  cfmToLitresPerSecond,
} from '../units';

/**
 * Conversions are checked against independently known values, not against the
 * module's own constants — a test that reuses the coefficient it is verifying
 * proves only that multiplication works.
 */

describe('cooling capacity', () => {
  it('converts a ton to 12,000 Btu/h, which is the definition', () => {
    expect(tonsToBtuPerHour(1)).toBe(12_000);
    expect(tonsToBtuPerHour(3.5)).toBe(42_000);
  });

  it('converts back', () => {
    expect(btuPerHourToTons(24_000)).toBe(2);
  });

  it('round-trips', () => {
    expect(btuPerHourToTons(tonsToBtuPerHour(7.25))).toBeCloseTo(7.25, 12);
  });
});

describe('power and heat', () => {
  it('converts 1 kW to about 3412 Btu/h', () => {
    // Standard reference value.
    expect(kilowattsToBtuPerHour(1)).toBeCloseTo(3412.14, 1);
  });

  it('converts 1 W to about 3.412 Btu/h', () => {
    expect(wattsToBtuPerHour(1)).toBeCloseTo(3.412, 3);
  });

  it('round-trips watts', () => {
    expect(btuPerHourToWatts(wattsToBtuPerHour(1500))).toBeCloseTo(1500, 9);
  });

  it('is slightly more accurate than the inline 0.000293 it replaces', () => {
    // A 36,000 Btu/h (3 TR) unit. The rounded constant is low by 0.024% —
    // 10.5480 kW against 10.5506 kW, a drift of 0.0026 kW.
    //
    // That is small, and worth saying so: this conversion was replaced for
    // single-definition reasons (CLAUDE.md §5), not because the old number was
    // materially wrong. The accuracy gain is a side effect.
    const exact = btuPerHourToKilowatts(36_000);
    const rounded = 36_000 * 0.000293;

    expect(exact).toBeCloseTo(10.5506, 4);
    expect(rounded).toBeCloseTo(10.548, 4);
    expect(Math.abs(exact - rounded)).toBeCloseTo(0.00256, 5);
    // Under a tenth of a percent, not the tenth of a percent first assumed.
    expect(Math.abs(exact - rounded) / exact).toBeLessThan(0.0005);
  });
});

describe('area', () => {
  it('converts a square metre to about 10.764 square feet', () => {
    expect(squareMetresToSquareFeet(1)).toBeCloseTo(10.7639, 4);
  });

  it('round-trips', () => {
    expect(squareFeetToSquareMetres(squareMetresToSquareFeet(240))).toBeCloseTo(240, 9);
  });
});

describe('temperature keeps differences and absolutes apart', () => {
  it('converts a difference without the offset', () => {
    // A 10 degC rise is an 18 degF rise, not 50.
    expect(celsiusDeltaToFahrenheitDelta(10)).toBe(18);
  });

  it('converts an absolute reading with the offset', () => {
    expect(celsiusToFahrenheit(10)).toBe(50);
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
  });

  it('keeps the two functions genuinely different', () => {
    // This is the classic silent error: using the delta factor on an absolute
    // reading is off by exactly 32 degrees and still looks like a temperature.
    expect(celsiusToFahrenheit(25) - celsiusDeltaToFahrenheitDelta(25)).toBe(32);
  });

  it('round-trips both directions', () => {
    expect(fahrenheitToCelsius(celsiusToFahrenheit(23.5))).toBeCloseTo(23.5, 12);
    expect(fahrenheitDeltaToCelsiusDelta(celsiusDeltaToFahrenheitDelta(12))).toBeCloseTo(12, 12);
  });

  it('handles a zero difference, which is not the freezing point', () => {
    expect(celsiusDeltaToFahrenheitDelta(0)).toBe(0);
    expect(celsiusToFahrenheit(0)).toBe(32);
  });
});

describe('airflow', () => {
  it('converts 1 L/s to about 2.119 CFM', () => {
    expect(litresPerSecondToCfm(1)).toBeCloseTo(2.1189, 4);
  });

  it('round-trips', () => {
    expect(cfmToLitresPerSecond(litresPerSecondToCfm(450))).toBeCloseTo(450, 9);
  });
});

describe('conversions are pure', () => {
  it('passes a zero through rather than treating it as missing', () => {
    expect(tonsToBtuPerHour(0)).toBe(0);
    expect(wattsToBtuPerHour(0)).toBe(0);
  });

  it('leaves validation to the caller', () => {
    // Deliberately not guarded: conversion and validation are separate
    // concerns, and a converter that throws in some contexts but not others is
    // harder to reason about than one that always converts.
    expect(tonsToBtuPerHour(-1)).toBe(-12_000);
  });
});
