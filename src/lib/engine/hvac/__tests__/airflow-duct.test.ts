import { describe, it, expect } from 'vitest';
import {
  calculateAirflowScenario,
  validateAirflowScenario,
  hasCriticalAirflowValidationIssues,
  defaultAirflowInputs,
  defaultAirflowOverrides,
  type AirflowInputs,
} from '@/lib/engine/hvac/airflow-duct-engine';

const inputs = (over: Partial<AirflowInputs> = {}): AirflowInputs => ({
  ...defaultAirflowInputs,
  ...over,
});

const run = (over: Partial<AirflowInputs> = {}) =>
  calculateAirflowScenario(inputs(over), defaultAirflowOverrides);

describe('calculateAirflowScenario — invariants', () => {
  it('produces one sizing row per branch, all finite and positive', () => {
    const res = run({ branches: 5 });
    expect(res.branchRows).toHaveLength(5);
    for (const r of res.branchRows) {
      expect(r.velocityFpm).toBeGreaterThan(0);
      expect(Number.isFinite(r.velocityFpm)).toBe(true);
      expect(r.designCfm).toBeGreaterThan(0);
      expect(r.pressureDropInWg).toBeGreaterThanOrEqual(0);
    }
  });

  it('branch design CFM sums to (approximately) the supply CFM', () => {
    const supplyCfm = 8000;
    const res = run({ supplyCfm, branches: 4 });
    const total = res.branchRows.reduce((s, r) => s + r.designCfm, 0);
    expect(total).toBeGreaterThan(supplyCfm * 0.9);
    expect(total).toBeLessThan(supplyCfm * 1.1);
  });

  it('sizes ducts so branch velocity stays in a physically sane band as CFM scales', () => {
    // Ducts are sized toward the target velocity, so velocity does not run
    // away with CFM — it stays bounded (that is the point of duct sizing).
    for (const supplyCfm of [3000, 7000, 12000]) {
      const res = run({ supplyCfm });
      for (const b of res.branchRows) {
        expect(b.velocityFpm).toBeGreaterThan(200);
        expect(b.velocityFpm).toBeLessThan(4000);
      }
    }
  });

  it('more airflow demands more fan power', () => {
    const low = run({ supplyCfm: 3000 });
    const high = run({ supplyCfm: 12000 });
    expect(high.requiredFanPowerHp).toBeGreaterThan(low.requiredFanPowerHp);
  });

  it('is deterministic for identical inputs', () => {
    const a = run({ supplyCfm: 7000 });
    const b = run({ supplyCfm: 7000 });
    expect(a.totalStaticPressureInWg).toBe(b.totalStaticPressureInWg);
    expect(a.branchRows.map((r) => r.velocityFpm)).toEqual(b.branchRows.map((r) => r.velocityFpm));
  });
});

describe('validateAirflowScenario — bounds', () => {
  it('flags out-of-range supply CFM and branches as issues', () => {
    const issues = validateAirflowScenario(inputs({ supplyCfm: 100, branches: 30 }), defaultAirflowOverrides);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.field === 'supplyCfm')).toBe(true);
    expect(issues.some((i) => i.field === 'branches')).toBe(true);
  });

  it('accepts in-range defaults with no critical issues', () => {
    const issues = validateAirflowScenario(defaultAirflowInputs, defaultAirflowOverrides);
    expect(hasCriticalAirflowValidationIssues(issues)).toBe(false);
  });
});
