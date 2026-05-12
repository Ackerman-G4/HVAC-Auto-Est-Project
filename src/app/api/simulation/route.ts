/**
 * Simulation API — POST /api/simulation
 * Handles CFD simulation, ASHRAE compliance, failure simulation,
 * PUE analysis, and cooling optimization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { runCFDSimulation } from '@/lib/functions/cfd-simulation';
import { compareOnly, autoCalibrate, calibrateWithSensors } from '@/lib/functions/calibration-engine';
import { checkASHRAECompliance } from '@/lib/functions/ashrae-compliance';
import { simulateFailure, calculatePUE } from '@/lib/functions/failure-simulation';
import { runOptimization } from '@/lib/functions/cooling-optimization';
import {
  getSimulationValidationError,
  simulationActionEnvelopeSchema,
  simulationInputSchema,
  failureConfigSchema,
  calibrationConfigSchema,
} from '@/lib/validation/simulation';
import { internalServerError, requireJsonRequest } from '@/lib/utils/api-helpers';
import type {
  SimulationInput,
  FailureConfig,
  CalibrationConfig,
  SimulationMetrics,
  ServerRack,
  HVACUnit,
  SensorReading,
  OptimizationConfig,
} from '@/types/simulation';

type SimAction = 'cfd' | 'compliance' | 'failure' | 'pue' | 'optimize' | 'calibrate';

const SIMULATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 12,
} as const;

export async function POST(request: NextRequest) {
  try {
    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const rateLimit = evaluateRateLimit(request, 'simulation', SIMULATION_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const rawBody = await request.json();
    const parsedBody = simulationActionEnvelopeSchema.safeParse(rawBody);

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: getSimulationValidationError(parsedBody.error) },
        { status: 400 },
      );
    }

    const body = parsedBody.data;
    const action: SimAction = body.action;

    if (!action) {
      return NextResponse.json(
        { error: 'action is required (cfd | compliance | failure | pue | optimize | calibrate)' },
        { status: 400 },
      );
    }

    switch (action) {
      case 'cfd': {
        const parsedInput = simulationInputSchema.safeParse(body.input);
        if (!parsedInput.success) {
          return NextResponse.json(
            { error: getSimulationValidationError(parsedInput.error) },
            { status: 400 },
          );
        }
        const input = parsedInput.data as SimulationInput;
        const result = runCFDSimulation(input);
        return NextResponse.json({ result });
      }

      case 'compliance': {
        const { metrics, racks, hvacUnits, thermalClass } = body;
        if (!metrics) {
          return NextResponse.json({ error: 'Simulation metrics required' }, { status: 400 });
        }
        const report = checkASHRAECompliance(
          metrics as SimulationMetrics,
          (Array.isArray(racks) ? racks : []) as ServerRack[],
          (Array.isArray(hvacUnits) ? hvacUnits : []) as HVACUnit[],
          thermalClass,
        );
        return NextResponse.json({ report });
      }

      case 'failure': {
        const parsedFailureConfig = failureConfigSchema.safeParse(body.failureConfig);
        if (!parsedFailureConfig.success) {
          return NextResponse.json(
            { error: getSimulationValidationError(parsedFailureConfig.error) },
            { status: 400 },
          );
        }
        const { racks, hvacUnits, ambientTempC } = body;
        const failConfig = parsedFailureConfig.data as FailureConfig;
        const result = simulateFailure(
          (Array.isArray(racks) ? racks : []) as ServerRack[],
          (Array.isArray(hvacUnits) ? hvacUnits : []) as HVACUnit[],
          failConfig,
          ambientTempC,
        );
        return NextResponse.json({ result });
      }

      case 'pue': {
        const { racks, hvacUnits, lightingPowerKW, otherPowerKW } = body;
        const analysis = calculatePUE(
          (Array.isArray(racks) ? racks : []) as ServerRack[],
          (Array.isArray(hvacUnits) ? hvacUnits : []) as HVACUnit[],
          lightingPowerKW,
          otherPowerKW,
        );
        return NextResponse.json({ analysis });
      }

      case 'optimize': {
        const parsedInput = simulationInputSchema.safeParse(body.input);
        if (!parsedInput.success) {
          return NextResponse.json(
            { error: getSimulationValidationError(parsedInput.error) },
            { status: 400 },
          );
        }
        const { optimizationConfig } = body;
        const input = parsedInput.data as SimulationInput;
        const result = runOptimization(input, optimizationConfig as OptimizationConfig | undefined);
        return NextResponse.json({ result });
      }

      case 'calibrate': {
        const parsedInput = simulationInputSchema.safeParse(body.input);
        if (!parsedInput.success) {
          return NextResponse.json(
            { error: getSimulationValidationError(parsedInput.error) },
            { status: 400 },
          );
        }

        const parsedCalibrationConfig = calibrationConfigSchema.safeParse(body.calibrationConfig);
        if (!parsedCalibrationConfig.success) {
          return NextResponse.json(
            { error: getSimulationValidationError(parsedCalibrationConfig.error) },
            { status: 400 },
          );
        }

        const input = parsedInput.data as SimulationInput;
        const calConfig = parsedCalibrationConfig.data as CalibrationConfig;
        const sensorReadings = (Array.isArray(body.sensorReadings)
          ? body.sensorReadings
          : []) as SensorReading[];

        // Run initial CFD for comparison baseline
        const cfdResult = runCFDSimulation(input);
        let calibrationResult;
        switch (calConfig.mode) {
          case 'compare':
            calibrationResult = compareOnly(input, cfdResult, sensorReadings);
            break;
          case 'auto-adjust':
            calibrationResult = autoCalibrate(input, cfdResult, calConfig);
            break;
          case 'sensor':
            if (!sensorReadings?.length) {
              return NextResponse.json({ error: 'Sensor readings are required for sensor calibration' }, { status: 400 });
            }
            calibrationResult = calibrateWithSensors(input, cfdResult, sensorReadings, calConfig);
            break;
          default:
            return NextResponse.json({ error: `Unknown calibration mode: ${calConfig.mode}` }, { status: 400 });
        }
        return NextResponse.json({ calibrationResult });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[Simulation API Error]', error);
    return internalServerError('Simulation error');
  }
}
