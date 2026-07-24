import {
  createAndDownloadPdf,
  hrLine,
  boldText,
} from '@/lib/utils/pdf-make';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type {
  ComplianceReport,
  FailureResult,
  OptimizationResult,
  PUEAnalysis,
  SimulationConfig,
  SimulationMetrics,
  SimulationResult,
} from '@/types/simulation';

export interface SimulationReportBuilderInput {
  projectId?: string;
  projectName?: string;
  floorId?: string;
  runtimeMode?: string;
  generatedAt?: string;
  config: SimulationConfig;
  rackCount: number;
  hvacCount: number;
  tileCount: number;
  totalHeatKw: number;
  totalCoolingKw: number;
  result: SimulationResult | null;
  resultMetrics?: SimulationMetrics | null;
  resultIteration?: number;
  complianceReport?: ComplianceReport | null;
  failureResult?: FailureResult | null;
  pueAnalysis?: PUEAnalysis | null;
  optimizationResult?: OptimizationResult | null;
}

export interface SimulationEngineeringReport {
  meta: {
    generatedAt: string;
    projectId: string;
    projectName: string;
    floorId: string;
    runtimeMode: string;
    mode: string;
    dimensionMode: string;
  };
  equipment: {
    rackCount: number;
    hvacCount: number;
    tileCount: number;
    totalHeatKw: number;
    totalCoolingKw: number;
  };
  simulation: {
    hasResult: boolean;
    iteration: number;
    converged: boolean;
    maxTemperatureC: number;
    avgTemperatureC: number;
    minTemperatureC: number;
    maxVelocityMs: number;
    pue: number;
    hotspotCount: number;
    continuityResidual: number;
    momentumResidual: number;
    energyResidual: number;
  };
  engineering: {
    airflowBalanceM3s: number;
    pressureImbalancePa: number;
    ventilationEffectiveness: number;
    deadZoneRatio: number;
    airflowDistributionScore: number;
    uniformityIndex: number;
    roomMetrics: Array<{
      roomId: string;
      floorId: string;
      floorNumber: number;
      avgTemperature: number;
      meanVelocity: number;
      stagnationRatio: number;
      pressure: number;
      inflowM3s: number;
      outflowM3s: number;
    }>;
  };
  compliance: {
    available: boolean;
    overallPass: boolean;
    score: number;
    thermalClass: string;
    failedChecks: string[];
  };
  pue: {
    available: boolean;
    value: number;
    rating: string;
    recommendations: string[];
  };
  optimization: {
    available: boolean;
    improvementPercent: number;
    iterations: number;
    bestIteration: number;
    suggestionCount: number;
    topSuggestions: string[];
  };
  failure: {
    available: boolean;
    scenario: string;
    timeToWarningSeconds: number;
    timeToCriticalSeconds: number;
    affectedRacks: number;
  };
}

function toNumber(value: number | undefined | null, fallback = 0): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return value;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'simulation';
}

function downloadText(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function buildSimulationEngineeringReport(
  input: SimulationReportBuilderInput,
): SimulationEngineeringReport {
  const simulationMetrics = input.result?.metrics ?? input.resultMetrics ?? null;
  const failedChecks = input.complianceReport?.checks
    .filter((check) => !check.passed)
    .map((check) => check.description) ?? [];

  return {
    meta: {
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      projectId: input.projectId ?? 'unknown-project',
      projectName: input.projectName ?? 'Simulation Project',
      floorId: input.floorId ?? 'unknown-floor',
      runtimeMode: input.runtimeMode ?? input.config.runtimeMode ?? 'worker',
      mode: input.config.mode,
      dimensionMode: input.config.dimensionMode ?? '3d',
    },
    equipment: {
      rackCount: input.rackCount,
      hvacCount: input.hvacCount,
      tileCount: input.tileCount,
      totalHeatKw: input.totalHeatKw,
      totalCoolingKw: input.totalCoolingKw,
    },
    simulation: {
      hasResult: !!(input.result || input.resultMetrics),
      iteration: toNumber(input.result?.iteration ?? input.resultIteration),
      converged: simulationMetrics?.converged ?? false,
      maxTemperatureC: toNumber(simulationMetrics?.maxTemperature),
      avgTemperatureC: toNumber(simulationMetrics?.avgTemperature),
      minTemperatureC: toNumber(simulationMetrics?.minTemperature),
      maxVelocityMs: toNumber(simulationMetrics?.maxVelocity),
      pue: toNumber(simulationMetrics?.pue),
      hotspotCount: simulationMetrics?.hotspots.length ?? 0,
      continuityResidual: toNumber(simulationMetrics?.continuityResidual),
      momentumResidual: toNumber(simulationMetrics?.momentumResidual),
      energyResidual: toNumber(simulationMetrics?.energyResidual),
    },
    engineering: {
      airflowBalanceM3s: toNumber(simulationMetrics?.airflowBalanceM3s),
      pressureImbalancePa: toNumber(simulationMetrics?.pressureImbalancePa),
      ventilationEffectiveness: toNumber(simulationMetrics?.ventilationEffectiveness),
      deadZoneRatio: toNumber(simulationMetrics?.deadZoneRatio),
      airflowDistributionScore: toNumber(simulationMetrics?.airflowDistributionScore),
      uniformityIndex: toNumber(simulationMetrics?.uniformityIndex),
      roomMetrics: (simulationMetrics?.roomMetrics ?? []).map((room) => ({
        roomId: room.roomId,
        floorId: room.floorId,
        floorNumber: room.floorNumber,
        avgTemperature: toNumber(room.avgTemperature),
        meanVelocity: toNumber(room.meanVelocity),
        stagnationRatio: toNumber(room.stagnationRatio),
        pressure: toNumber(room.pressure),
        inflowM3s: toNumber(room.inflowM3s),
        outflowM3s: toNumber(room.outflowM3s),
      })),
    },
    compliance: {
      available: !!input.complianceReport,
      overallPass: input.complianceReport?.overallPass ?? false,
      score: toNumber(input.complianceReport?.score),
      thermalClass: input.complianceReport?.thermalClass ?? 'N/A',
      failedChecks,
    },
    pue: {
      available: !!input.pueAnalysis,
      value: toNumber(input.pueAnalysis?.pue),
      rating: input.pueAnalysis?.rating ?? 'N/A',
      recommendations: input.pueAnalysis?.recommendations ?? [],
    },
    optimization: {
      available: !!input.optimizationResult,
      improvementPercent: toNumber(input.optimizationResult?.improvement),
      iterations: toNumber(input.optimizationResult?.iterations),
      bestIteration: toNumber(input.optimizationResult?.bestIteration),
      suggestionCount: input.optimizationResult?.suggestions.length ?? 0,
      topSuggestions: (input.optimizationResult?.suggestions ?? []).slice(0, 5).map((item) => item.description),
    },
    failure: {
      available: !!input.failureResult,
      scenario: input.failureResult?.scenario ?? 'N/A',
      timeToWarningSeconds: toNumber(input.failureResult?.timeToWarning, -1),
      timeToCriticalSeconds: toNumber(input.failureResult?.timeToCritical, -1),
      affectedRacks: input.failureResult?.affectedRacks.length ?? 0,
    },
  };
}

export function exportSimulationReportJson(report: SimulationEngineeringReport, fileStem?: string): void {
  const stem = fileStem ?? `simulation-report-${slugify(report.meta.projectName)}`;
  downloadText(
    `${stem}.json`,
    JSON.stringify(report, null, 2),
    'application/json;charset=utf-8',
  );
}

export function exportSimulationReportCsv(report: SimulationEngineeringReport, fileStem?: string): void {
  const stem = fileStem ?? `simulation-report-${slugify(report.meta.projectName)}`;
  const roomMetricRows: Array<[string, string | number | boolean]> = report.engineering.roomMetrics.flatMap(
    (room): Array<[string, string | number | boolean]> => [
      [`room.${room.roomId}.floorId`, room.floorId],
      [`room.${room.roomId}.floorNumber`, room.floorNumber],
      [`room.${room.roomId}.avgTemperature`, room.avgTemperature.toFixed(3)],
      [`room.${room.roomId}.meanVelocity`, room.meanVelocity.toFixed(4)],
      [`room.${room.roomId}.stagnationRatio`, room.stagnationRatio.toFixed(4)],
      [`room.${room.roomId}.pressure`, room.pressure.toFixed(4)],
      [`room.${room.roomId}.inflowM3s`, room.inflowM3s.toFixed(4)],
      [`room.${room.roomId}.outflowM3s`, room.outflowM3s.toFixed(4)],
    ],
  );

  const rows: Array<[string, string | number | boolean]> = [
    ['generatedAt', report.meta.generatedAt],
    ['projectId', report.meta.projectId],
    ['projectName', report.meta.projectName],
    ['floorId', report.meta.floorId],
    ['runtimeMode', report.meta.runtimeMode],
    ['mode', report.meta.mode],
    ['dimensionMode', report.meta.dimensionMode],
    ['rackCount', report.equipment.rackCount],
    ['hvacCount', report.equipment.hvacCount],
    ['tileCount', report.equipment.tileCount],
    ['totalHeatKw', report.equipment.totalHeatKw.toFixed(2)],
    ['totalCoolingKw', report.equipment.totalCoolingKw.toFixed(2)],
    ['hasResult', report.simulation.hasResult],
    ['iteration', report.simulation.iteration],
    ['converged', report.simulation.converged],
    ['maxTemperatureC', report.simulation.maxTemperatureC.toFixed(3)],
    ['avgTemperatureC', report.simulation.avgTemperatureC.toFixed(3)],
    ['minTemperatureC', report.simulation.minTemperatureC.toFixed(3)],
    ['maxVelocityMs', report.simulation.maxVelocityMs.toFixed(5)],
    ['simulationPue', report.simulation.pue.toFixed(4)],
    ['hotspotCount', report.simulation.hotspotCount],
    ['continuityResidual', report.simulation.continuityResidual.toExponential(3)],
    ['momentumResidual', report.simulation.momentumResidual.toExponential(3)],
    ['energyResidual', report.simulation.energyResidual.toExponential(3)],
    ['airflowBalanceM3s', report.engineering.airflowBalanceM3s.toFixed(4)],
    ['pressureImbalancePa', report.engineering.pressureImbalancePa.toFixed(4)],
    ['ventilationEffectiveness', report.engineering.ventilationEffectiveness.toFixed(4)],
    ['deadZoneRatio', report.engineering.deadZoneRatio.toFixed(4)],
    ['airflowDistributionScore', report.engineering.airflowDistributionScore.toFixed(4)],
    ['uniformityIndex', report.engineering.uniformityIndex.toFixed(4)],
    ['roomMetricsCount', report.engineering.roomMetrics.length],
    ['complianceAvailable', report.compliance.available],
    ['complianceOverallPass', report.compliance.overallPass],
    ['complianceScore', report.compliance.score],
    ['complianceThermalClass', report.compliance.thermalClass],
    ['pueAvailable', report.pue.available],
    ['pueValue', report.pue.value],
    ['pueRating', report.pue.rating],
    ['optimizationAvailable', report.optimization.available],
    ['optimizationImprovementPercent', report.optimization.improvementPercent],
    ['optimizationIterations', report.optimization.iterations],
    ['optimizationBestIteration', report.optimization.bestIteration],
    ['optimizationSuggestionCount', report.optimization.suggestionCount],
    ['failureAvailable', report.failure.available],
    ['failureScenario', report.failure.scenario],
    ['failureTimeToWarningSeconds', report.failure.timeToWarningSeconds],
    ['failureTimeToCriticalSeconds', report.failure.timeToCriticalSeconds],
    ['failureAffectedRacks', report.failure.affectedRacks],
    ...roomMetricRows,
  ];

  const csv = [
    'metric,value',
    ...rows.map(([metric, value]) => {
      const raw = String(value).replace(/"/g, '""');
      return `"${metric}","${raw}"`;
    }),
  ].join('\n');

  downloadText(`${stem}.csv`, csv, 'text/csv;charset=utf-8');
}

export async function exportSimulationReportPdf(report: SimulationEngineeringReport, fileStem?: string): Promise<void> {
  const stem = fileStem ?? `simulation-report-${slugify(report.meta.projectName)}`;
  const bold = boldText;

  const summaryRows = [
    ['Project', report.meta.projectName],
    ['Project ID', report.meta.projectId],
    ['Floor ID', report.meta.floorId],
    ['Generated', new Date(report.meta.generatedAt).toLocaleString()],
    ['Runtime', report.meta.runtimeMode],
    ['Mode', `${report.meta.mode} (${report.meta.dimensionMode})`],
    ['Equipment', `${report.equipment.rackCount} racks / ${report.equipment.hvacCount} HVAC / ${report.equipment.tileCount} tiles`],
    ['Thermal Load', `${report.equipment.totalHeatKw.toFixed(1)} kW heat / ${report.equipment.totalCoolingKw.toFixed(1)} kW cooling`],
  ];

  const simulationRows = [
    ['Converged', report.simulation.converged ? 'Yes' : 'No'],
    ['Iterations', `${report.simulation.iteration}`],
    ['Max Temp', `${report.simulation.maxTemperatureC.toFixed(2)} °C`],
    ['Avg Temp', `${report.simulation.avgTemperatureC.toFixed(2)} °C`],
    ['Max Velocity', `${report.simulation.maxVelocityMs.toFixed(3)} m/s`],
    ['PUE', report.simulation.pue.toFixed(3)],
    ['Hotspots', `${report.simulation.hotspotCount}`],
    ['Energy Residual', report.simulation.energyResidual.toExponential(3)],
  ];

  const engineeringRows = [
    ['Airflow Balance', `${report.engineering.airflowBalanceM3s.toFixed(4)} m3/s`],
    ['Pressure Imbalance', `${report.engineering.pressureImbalancePa.toFixed(4)} Pa`],
    ['Ventilation Effectiveness', `${(report.engineering.ventilationEffectiveness * 100).toFixed(1)} %`],
    ['Dead Zone Ratio', `${(report.engineering.deadZoneRatio * 100).toFixed(1)} %`],
    ['Airflow Distribution Score', report.engineering.airflowDistributionScore.toFixed(3)],
    ['Uniformity Index', report.engineering.uniformityIndex.toFixed(3)],
    ['Room Metrics', `${report.engineering.roomMetrics.length} rooms`],
  ];

  const roomMetricsRows = [
    ['Room', 'Floor', 'Avg Temp (C)', 'Mean Vel (m/s)', 'Stagnation', 'Pressure (Pa)', 'Inflow (m3/s)', 'Outflow (m3/s)'],
    ...report.engineering.roomMetrics.slice(0, 12).map((room) => [
      room.roomId,
      `${room.floorId} (#${room.floorNumber})`,
      room.avgTemperature.toFixed(2),
      room.meanVelocity.toFixed(3),
      room.stagnationRatio.toFixed(3),
      room.pressure.toFixed(3),
      room.inflowM3s.toFixed(3),
      room.outflowM3s.toFixed(3),
    ]),
  ];

  const docDefinition: TDocumentDefinitions = {
    content: [
      bold('CFD Simulation Engineering Report', { fontSize: 18, margin: [0, 0, 0, 8] }),
      hrLine(),
      bold('Report Summary', { fontSize: 12, margin: [0, 4, 0, 4] }),
      {
        table: {
          widths: [160, '*'],
          body: summaryRows,
        },
        layout: 'noBorders',
      },
      hrLine(),
      bold('Simulation Metrics', { fontSize: 12, margin: [0, 4, 0, 4] }),
      {
        table: {
          widths: [170, '*'],
          body: simulationRows,
        },
        layout: 'lightHorizontalLines',
      },
      hrLine(),
      bold('Engineering Metrics', { fontSize: 12, margin: [0, 4, 0, 4] }),
      {
        table: {
          widths: [170, '*'],
          body: engineeringRows,
        },
        layout: 'lightHorizontalLines',
      },
      report.engineering.roomMetrics.length > 0
        ? {
          stack: [
            bold('Room Metrics (Top 12)', { fontSize: 11, margin: [0, 4, 0, 4] }),
            {
              table: {
                headerRows: 1,
                widths: [70, 90, 60, 62, 52, 62, 62, 62],
                body: roomMetricsRows,
              },
              layout: 'lightHorizontalLines',
            },
          ],
        }
        : { text: '' },
      hrLine(),
      bold('Optimization', { fontSize: 12, margin: [0, 4, 0, 4] }),
      {
        table: {
          widths: [170, '*'],
          body: [
            ['Available', report.optimization.available ? 'Yes' : 'No'],
            ['Improvement', `${report.optimization.improvementPercent.toFixed(2)} %`],
            ['Iterations', `${report.optimization.iterations}`],
            ['Best Iteration', `${report.optimization.bestIteration}`],
            ['Suggestions', `${report.optimization.suggestionCount}`],
          ],
        },
        layout: 'lightHorizontalLines',
      },
      report.compliance.available
        ? {
          stack: [
            hrLine(),
            bold('Compliance', { fontSize: 12, margin: [0, 4, 0, 4] }),
            {
              text: `ASHRAE ${report.compliance.thermalClass} • Score ${report.compliance.score} • ${report.compliance.overallPass ? 'PASS' : 'FAIL'}`,
            },
          ],
        }
        : { text: '' },
    ],
    pageSize: 'A4',
    defaultStyle: { font: 'Roboto' },
  };

  await createAndDownloadPdf(docDefinition, `${stem}.pdf`);
}
