import { describe, expect, it } from 'vitest';
import {
  createReportHistorySchema,
  reportHistoryScopeSchema,
  isUnscopedProjectId,
} from '../simulation-reports';

/**
 * Report history contracts.
 *
 * The handler guarded every numeric field with `typeof x === 'number'`, which
 * is true for NaN and Infinity. These are figures a user reads off a report,
 * so the NaN cases below are the reason this file exists.
 */

const minimal = { format: 'pdf' as const, source: 'viewer' as const };

describe('NaN and Infinity cannot reach a stored report', () => {
  it('rejects a NaN temperature', () => {
    // `typeof NaN === 'number'` is true, so the old guard passed it through and
    // the history view rendered the literal text "NaN".
    expect(createReportHistorySchema.safeParse({ ...minimal, maxTemperatureC: NaN }).success).toBe(false);
  });

  it('rejects an Infinite temperature', () => {
    expect(createReportHistorySchema.safeParse({ ...minimal, maxTemperatureC: Infinity }).success).toBe(false);
  });

  it('rejects a NaN PUE', () => {
    expect(createReportHistorySchema.safeParse({ ...minimal, pue: NaN }).success).toBe(false);
  });

  it('rejects a NaN hotspot count', () => {
    // The old clamp was Math.max(0, Math.trunc(NaN)), which is NaN — a bound
    // that looks like it constrains the value and does not.
    expect(createReportHistorySchema.safeParse({ ...minimal, hotspotCount: NaN }).success).toBe(false);
    expect(Math.max(0, Math.trunc(NaN))).toBeNaN();
  });
});

describe('PUE is bounded by physics', () => {
  it('accepts a realistic facility figure', () => {
    expect(createReportHistorySchema.parse({ ...minimal, pue: 1.45 }).pue).toBe(1.45);
  });

  it('rejects a PUE below 1', () => {
    // A facility cannot draw less total power than its IT load; below 1 is a
    // broken calculation, not an efficient datacentre.
    expect(createReportHistorySchema.safeParse({ ...minimal, pue: 0.8 }).success).toBe(false);
  });

  it('still allows 0 as the not-computed default', () => {
    expect(createReportHistorySchema.parse({ ...minimal, pue: 0 }).pue).toBe(0);
    expect(createReportHistorySchema.parse(minimal).pue).toBe(0);
  });

  it('rejects a negative PUE', () => {
    expect(createReportHistorySchema.safeParse({ ...minimal, pue: -1 }).success).toBe(false);
  });
});

describe('enumerated fields', () => {
  it('accepts every source the handler supports', () => {
    for (const source of ['viewer', 'workspace', 'engine'] as const) {
      expect(createReportHistorySchema.safeParse({ ...minimal, source }).success).toBe(true);
    }
  });

  it('rejects an unknown format and an unknown source', () => {
    expect(createReportHistorySchema.safeParse({ ...minimal, format: 'xlsx' }).success).toBe(false);
    expect(createReportHistorySchema.safeParse({ ...minimal, source: 'cli' }).success).toBe(false);
  });

  it('requires both format and source', () => {
    expect(createReportHistorySchema.safeParse({ source: 'viewer' }).success).toBe(false);
    expect(createReportHistorySchema.safeParse({ format: 'pdf' }).success).toBe(false);
  });
});

describe('defaults match what the handler used to apply by hand', () => {
  it('fills the documented fallbacks', () => {
    const parsed = createReportHistorySchema.parse(minimal);
    expect(parsed.projectId).toBe('unknown-project');
    expect(parsed.projectName).toBe('Simulation Project');
    expect(parsed.floorId).toBe('unknown-floor');
    expect(parsed.runtimeMode).toBe('worker');
    expect(parsed.converged).toBe(false);
    expect(parsed.hotspotCount).toBe(0);
  });

  it('treats a whitespace-only name as absent rather than storing it', () => {
    expect(createReportHistorySchema.safeParse({ ...minimal, projectName: '   ' }).success).toBe(false);
  });

  it('validates generatedAt as a real timestamp, not merely a string', () => {
    expect(
      createReportHistorySchema.safeParse({ ...minimal, generatedAt: '2026-08-01T10:30:00Z' }).success,
    ).toBe(true);
    expect(createReportHistorySchema.safeParse({ ...minimal, generatedAt: 'last tuesday' }).success).toBe(false);
  });
});

describe('scope', () => {
  it('recognises the unscoped sentinels the ownership check skips', () => {
    expect(isUnscopedProjectId('unknown-project')).toBe(true);
    expect(isUnscopedProjectId('workspace')).toBe(true);
    expect(isUnscopedProjectId('proj-123')).toBe(false);
  });

  it('accepts an empty scope, which means every report for this owner', () => {
    expect(reportHistoryScopeSchema.parse({}).projectId).toBeUndefined();
  });

  it('rejects a blank projectId rather than reading it as no scope', () => {
    // This is the widening the old `.catch(() => null)` allowed: a body that
    // failed to convey a project turned a scoped delete into a total one.
    expect(reportHistoryScopeSchema.safeParse({ projectId: '   ' }).success).toBe(false);
  });

  it('rejects a non-string projectId', () => {
    expect(reportHistoryScopeSchema.safeParse({ projectId: 123 }).success).toBe(false);
  });
});
