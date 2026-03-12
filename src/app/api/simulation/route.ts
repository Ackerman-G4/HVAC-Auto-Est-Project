/**
 * Simulation API — POST /api/simulation
 * Handles CFD simulation, ASHRAE compliance, failure simulation,
 * PUE analysis, and cooling optimization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runCFDSimulation } from '@/lib/functions/cfd-simulation';
import { checkASHRAECompliance } from '@/lib/functions/ashrae-compliance';
import { simulateFailure, calculatePUE } from '@/lib/functions/failure-simulation';
import { runOptimization } from '@/lib/functions/cooling-optimization';
import type { SimulationInput, FailureConfig, OptimizationConfig } from '@/types/simulation';
import { getUserId, errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';

type SimAction = 'cfd' | 'compliance' | 'failure' | 'pue' | 'optimize';

export async function POST(request: NextRequest) {
  try {
    const uid = await getUserId(request);
    if (!uid) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to run simulations.');
    }

    const body = await request.json();
    const action: SimAction = body.action;

    if (!action) {
      return errorResponse(400, 'Missing action', 'action is required (cfd | compliance | failure | pue | optimize)');
    }

    switch (action) {
      case 'cfd': {
        const input: SimulationInput = body.input;
        if (!input || !input.config) {
          return errorResponse(400, 'Invalid input', 'Simulation input with config is required');
        }
        const result = runCFDSimulation(input);
        return NextResponse.json({ result });
      }

      case 'compliance': {
        const { metrics, racks, hvacUnits, thermalClass } = body;
        if (!metrics) {
          return errorResponse(400, 'Invalid input', 'Simulation metrics required');
        }
        const report = checkASHRAECompliance(metrics, racks || [], hvacUnits || [], thermalClass);
        return NextResponse.json({ report });
      }

      case 'failure': {
        const { racks, hvacUnits, failureConfig, ambientTempC } = body;
        if (!failureConfig) {
          return errorResponse(400, 'Invalid input', 'failureConfig is required');
        }
        const failConfig: FailureConfig = {
          scenario: failureConfig.scenario || 'crac_failure',
          failedUnitIds: failureConfig.failedUnitIds || [],
          duration: failureConfig.duration || 3600,
          timeStep: failureConfig.timeStep || 10,
          rackMass: failureConfig.rackMass || 500,
          specificHeat: failureConfig.specificHeat || 900,
        };
        const result = simulateFailure(racks || [], hvacUnits || [], failConfig, ambientTempC);
        return NextResponse.json({ result });
      }

      case 'pue': {
        const { racks, hvacUnits, lightingPowerKW, otherPowerKW } = body;
        const analysis = calculatePUE(racks || [], hvacUnits || [], lightingPowerKW, otherPowerKW);
        return NextResponse.json({ analysis });
      }

      case 'optimize': {
        const { input, optimizationConfig } = body;
        if (!input || !input.config) {
          return errorResponse(400, 'Invalid input', 'Simulation input is required for optimization');
        }
        const result = runOptimization(input, optimizationConfig);
        return NextResponse.json({ result });
      }

      default:
        return errorResponse(400, 'Unknown action', `Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[Simulation API Error]', error);
    const d = getErrorDetails(error, 'Simulation error');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
