import { z } from 'zod';

const simulationModeSchema = z.enum(['fast', 'balanced', 'engineering']);
const runtimeModeSchema = z.enum(['worker', 'server', 'openfoam']);
const dimensionModeSchema = z.enum(['3d', '2d-fast']);
const failureScenarioSchema = z.enum(['crac_failure', 'power_loss', 'cooling_restart', 'partial_cooling']);
const calibrationModeSchema = z.enum(['compare', 'auto-adjust', 'sensor']);
const ashraeThermalClassSchema = z.enum(['A1', 'A2', 'A3', 'A4', 'B', 'C']);

const simulationConfigSchema = z
  .object({
    mode: simulationModeSchema,
    runtimeMode: runtimeModeSchema.optional(),
    dimensionMode: dimensionModeSchema.optional(),
    gridResolution: z.number().finite().min(0.05).max(2),
    gridSizeX: z.number().int().min(5).max(120),
    gridSizeY: z.number().int().min(5).max(120),
    gridSizeZ: z.number().int().min(2).max(60),
    iterations: z.number().int().min(1).max(10000),
    progressEmitInterval: z.number().int().min(1).max(10000).optional(),
    convergence: z.number().finite().min(1e-9).max(1),
    timeStep: z.number().finite().min(0.001).max(120),
    ambientTempC: z.number().finite().min(-40).max(80),
    ambientHumidityRatio: z.number().finite().min(0).max(0.1),
    airDensity: z.number().finite().min(0.1).max(5),
    airViscosity: z.number().finite().min(1e-9).max(1),
    thermalDiffusivity: z.number().finite().min(1e-9).max(1),
    specificHeat: z.number().finite().min(10).max(10000),
  })
  .passthrough();

export const simulationInputSchema = z
  .object({
    projectId: z.string().trim().min(1).max(200),
    floorId: z.string().trim().min(1).max(200),
    config: simulationConfigSchema,
    racks: z.array(z.unknown()).max(5000),
    hvacUnits: z.array(z.unknown()).max(5000),
    tiles: z.array(z.unknown()).max(50000),
    raisedFloorHeight: z.number().finite().min(0).max(20),
    calibration: z.object({}).passthrough().optional(),
  })
  .passthrough();

export const failureConfigSchema = z
  .object({
    scenario: failureScenarioSchema,
    failedUnitIds: z.array(z.string().trim().min(1).max(200)).max(500),
    duration: z.number().finite().min(1).max(60 * 60 * 24 * 30),
    timeStep: z.number().finite().min(1).max(3600),
    rackMass: z.number().finite().min(1).max(100000),
    specificHeat: z.number().finite().min(1).max(10000),
  })
  .strict();

export const calibrationConfigSchema = z
  .object({
    mode: calibrationModeSchema,
    maxIterations: z.number().int().min(1).max(1000),
    targetDeviationPct: z.number().finite().min(0).max(100),
    dampingFactor: z.number().finite().min(0).max(10),
  })
  .passthrough();

export const simulationActionEnvelopeSchema = z
  .object({
    action: z.enum(['cfd', 'compliance', 'failure', 'pue', 'optimize', 'calibrate']),
    input: z.unknown().optional(),
    metrics: z.unknown().optional(),
    racks: z.array(z.unknown()).max(5000).optional(),
    hvacUnits: z.array(z.unknown()).max(5000).optional(),
    thermalClass: ashraeThermalClassSchema.optional(),
    failureConfig: z.unknown().optional(),
    ambientTempC: z.number().finite().min(-40).max(80).optional(),
    lightingPowerKW: z.number().finite().min(0).max(1_000_000).optional(),
    otherPowerKW: z.number().finite().min(0).max(1_000_000).optional(),
    optimizationConfig: z.unknown().optional(),
    calibrationConfig: z.unknown().optional(),
    sensorReadings: z.array(z.unknown()).max(50000).optional(),
  })
  .passthrough();

export function getSimulationValidationError(error: z.ZodError): string {
  return error.issues[0]?.message || 'Invalid simulation request payload';
}
