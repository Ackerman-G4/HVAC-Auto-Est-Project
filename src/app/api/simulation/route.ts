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

type SimAction = 'cfd' | 'compliance' | 'failure' | 'pue' | 'optimize';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action: SimAction = body.action;

    if (!action) {
      return NextResponse.json(
        { error: 'action is required (cfd | compliance | failure | pue | optimize)' },
        { status: 400 },
      );
    }

    switch (action) {
      case 'cfd': {
        const input: SimulationInput = body.input;
        if (!input || !input.config) {
          return NextResponse.json({ error: 'Simulation input with config is required' }, { status: 400 });
        }
        const result = runCFDSimulation(input);
        return NextResponse.json({ result });
      }

      case 'compliance': {
        const { metrics, racks, hvacUnits, thermalClass } = body;
        if (!metrics) {
          return NextResponse.json({ error: 'Simulation metrics required' }, { status: 400 });
        }
        const report = checkASHRAECompliance(metrics, racks || [], hvacUnits || [], thermalClass);
        return NextResponse.json({ report });
      }

      case 'failure': {
        const { racks, hvacUnits, failureConfig, ambientTempC } = body;
        if (!failureConfig) {
          return NextResponse.json({ error: 'failureConfig is required' }, { status: 400 });
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
          return NextResponse.json({ error: 'Simulation input is required for optimization' }, { status: 400 });
        }
        const result = runOptimization(input, optimizationConfig);
        return NextResponse.json({ result });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('[Simulation API Error]', error);
    return NextResponse.json(
      { error: 'Simulation error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
