import { describe, expect, it } from 'vitest';
import { parseJsonBody, type ValidationErrorBody } from '../http';
import {
  createReportHistorySchema,
  projectScopedRequestSchema,
  simulationEngineeringReportSchema,
} from '../simulation-reports';

/**
 * Simulation report history.
 *
 * The record is persisted verbatim, so anything admitted here is what a later
 * reader gets. Two defects motivated the schema: a wrong scalar type was
 * silently replaced by a default and reported as success, and the report body
 * was admitted by a cast rather than a check.
 */

function jsonRequest(body: unknown): Request {
  return new Request('https://example.test/api/simulation/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function bodyOf(response: Response): Promise<ValidationErrorBody> {
  return (await response.json()) as ValidationErrorBody;
}

const validReport = {
  meta: {
    generatedAt: '2026-08-28T10:00:00.000Z',
    projectId: 'p1',
    projectName: 'Data Hall A',
    floorId: 'f1',
    runtimeMode: 'worker',
    mode: 'steady',
    dimensionMode: '3d',
  },
  equipment: { rackCount: 12, hvacCount: 4, tileCount: 96, totalHeatKw: 84.2, totalCoolingKw: 96 },
  simulation: {
    hasResult: true,
    iteration: 400,
    converged: true,
    maxTemperatureC: 31.4,
    avgTemperatureC: 24.1,
    minTemperatureC: 18.9,
    maxVelocityMs: 2.4,
    pue: 1.42,
    hotspotCount: 2,
    continuityResidual: 1e-5,
    momentumResidual: 2e-5,
    energyResidual: 3e-5,
  },
  engineering: {
    airflowBalanceM3s: 0.02,
    pressureImbalancePa: 1.5,
    ventilationEffectiveness: 0.92,
    deadZoneRatio: 0.04,
    airflowDistributionScore: 87,
    uniformityIndex: 0.91,
    roomMetrics: [
      {
        roomId: 'r1',
        floorId: 'f1',
        floorNumber: 1,
        avgTemperature: 24.1,
        meanVelocity: 0.8,
        stagnationRatio: 0.03,
        pressure: 101325,
        inflowM3s: 1.2,
        outflowM3s: 1.18,
      },
    ],
  },
  compliance: { available: true, overallPass: true, score: 92, thermalClass: 'A1', failedChecks: [] },
  pue: { available: true, value: 1.42, rating: 'good', recommendations: [] },
  optimization: {
    available: false,
    improvementPercent: 0,
    iterations: 0,
    bestIteration: 0,
    suggestionCount: 0,
    topSuggestions: [],
  },
  failure: {
    available: false,
    scenario: 'none',
    timeToWarningSeconds: 0,
    timeToCriticalSeconds: 0,
    affectedRacks: 0,
  },
};

describe('the export the application actually sends is accepted', () => {
  it('accepts the full payload the report exporter builds', () => {
    const parsed = createReportHistorySchema.safeParse({
      format: 'pdf',
      source: 'viewer',
      projectId: validReport.meta.projectId,
      projectName: validReport.meta.projectName,
      floorId: validReport.meta.floorId,
      runtimeMode: validReport.meta.runtimeMode,
      converged: validReport.simulation.converged,
      maxTemperatureC: validReport.simulation.maxTemperatureC,
      pue: validReport.simulation.pue,
      hotspotCount: validReport.simulation.hotspotCount,
      generatedAt: validReport.meta.generatedAt,
      report: validReport,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.report?.simulation.maxTemperatureC).toBe(31.4);
  });

  it('accepts a timestamp produced by toISOString, the only producer in the app', () => {
    const parsed = createReportHistorySchema.safeParse({
      format: 'json',
      source: 'engine',
      generatedAt: new Date().toISOString(),
    });

    expect(parsed.success).toBe(true);
  });

  it('supplies the documented sentinels when the workspace was never named', () => {
    const parsed = createReportHistorySchema.safeParse({ format: 'csv', source: 'workspace' });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.projectId).toBe('unknown-project');
    expect(parsed.data.projectName).toBe('Simulation Project');
    expect(parsed.data.floorId).toBe('unknown-floor');
    expect(parsed.data.runtimeMode).toBe('worker');
    expect(parsed.data.converged).toBe(false);
    expect(parsed.data.report).toBeUndefined();
  });

  it('treats a blank label as unnamed rather than as an error', () => {
    const parsed = createReportHistorySchema.safeParse({
      format: 'csv',
      source: 'workspace',
      projectName: '   ',
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.projectName).toBe('Simulation Project');
  });
});

describe('a wrong scalar type is reported rather than replaced by a default', () => {
  it('rejects a temperature sent as a string instead of storing zero', () => {
    // The replaced ternary stored 0 and returned 201, so the caller was told a
    // wrong reading had been recorded.
    expect(
      createReportHistorySchema.safeParse({
        format: 'pdf',
        source: 'viewer',
        maxTemperatureC: '31.4',
      }).success,
    ).toBe(false);
  });

  it('rejects NaN, which the old typeof check admitted', () => {
    // typeof NaN === 'number' is true.
    expect(
      createReportHistorySchema.safeParse({ format: 'pdf', source: 'viewer', pue: Number.NaN })
        .success,
    ).toBe(false);
  });

  it('rejects a negative hotspot count instead of clamping it to zero', () => {
    expect(
      createReportHistorySchema.safeParse({ format: 'pdf', source: 'viewer', hotspotCount: -3 })
        .success,
    ).toBe(false);
  });

  it('truncates a fractional hotspot count, because a count is whole', () => {
    const parsed = createReportHistorySchema.safeParse({
      format: 'pdf',
      source: 'viewer',
      hotspotCount: 3.7,
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.hotspotCount).toBe(3);
  });

  it('rejects a timestamp that would not sort', () => {
    // The history list orders on Date.parse of this field.
    expect(
      createReportHistorySchema.safeParse({
        format: 'pdf',
        source: 'viewer',
        generatedAt: 'yesterday',
      }).success,
    ).toBe(false);
  });

  it('rejects an export format outside the three the store defines', () => {
    expect(createReportHistorySchema.safeParse({ format: 'docx', source: 'viewer' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown top-level key rather than dropping it', () => {
    expect(
      createReportHistorySchema.safeParse({
        format: 'pdf',
        source: 'viewer',
        ownerId: 'someone-else',
      }).success,
    ).toBe(false);
  });
});

describe('the report body is checked rather than cast', () => {
  it('refuses an arbitrary object claiming to be a report', () => {
    // The removed cast accepted exactly this.
    expect(
      createReportHistorySchema.safeParse({
        format: 'pdf',
        source: 'viewer',
        report: { arbitrary: 'payload' },
      }).success,
    ).toBe(false);
  });

  it('refuses a report missing a section the readers index into', () => {
    const withoutSimulation = { ...validReport, simulation: undefined };
    expect(simulationEngineeringReportSchema.safeParse(withoutSimulation).success).toBe(false);
  });

  it('refuses a non-finite reading buried inside the report', () => {
    const poisoned = {
      ...validReport,
      simulation: { ...validReport.simulation, pue: Number.POSITIVE_INFINITY },
    };

    expect(simulationEngineeringReportSchema.safeParse(poisoned).success).toBe(false);
  });

  it('refuses a room metrics array large enough to be an attack on storage', () => {
    const room = validReport.engineering.roomMetrics[0];
    const flooded = {
      ...validReport,
      engineering: {
        ...validReport.engineering,
        roomMetrics: Array.from({ length: 5001 }, () => room),
      },
    };

    expect(simulationEngineeringReportSchema.safeParse(flooded).success).toBe(false);
  });
});

describe('clear and backfill accept an empty scope', () => {
  it('accepts an empty body, meaning every project owned by the caller', () => {
    const parsed = projectScopedRequestSchema.safeParse({});

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.projectId).toBeUndefined();
  });

  it('rejects a present but wrongly typed projectId instead of ignoring it', () => {
    expect(projectScopedRequestSchema.safeParse({ projectId: 42 }).success).toBe(false);
  });
});

describe('the handler contract for an invalid report body', () => {
  it('answers 400 naming the offending field', async () => {
    const parsed = await parseJsonBody(
      jsonRequest({ format: 'pdf', source: 'viewer', pue: 'high' }),
      createReportHistorySchema,
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.response.status).toBe(400);

    const body = await bodyOf(parsed.response);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details[0].path).toBe('pue');
  });
});
