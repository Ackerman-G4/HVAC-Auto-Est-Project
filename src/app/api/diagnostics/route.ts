/**
 * Diagnostics API — POST /api/diagnostics
 * Accepts system info + symptoms, returns ranked fault analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDiagnostic } from '@/lib/functions/diagnostic';
import type { DiagnosticInput } from '@/types/diagnostic';

export async function POST(request: NextRequest) {
  try {
    const body: Partial<DiagnosticInput> = await request.json();

    if (!body.systemType) {
      return NextResponse.json(
        { error: 'systemType is required', description: 'Select a system type before running diagnostics.' },
        { status: 400 },
      );
    }

    const input: DiagnosticInput = {
      systemType: body.systemType,
      applicationType: body.applicationType ?? 'residential',
      refrigerantType: body.refrigerantType,
      systemAgeDays: body.systemAgeDays,
      symptomDescription: body.symptomDescription ?? '',
      unevenCooling: body.unevenCooling ?? false,
      weakAirflow: body.weakAirflow ?? false,
      highHumidity: body.highHumidity ?? false,
      noisyOperation: body.noisyOperation ?? false,
      iceFormation: body.iceFormation ?? false,
      shortCycling: body.shortCycling ?? false,
      highEnergyBills: body.highEnergyBills ?? false,
      supplyTempCold: body.supplyTempCold,
      supplyTempWarm: body.supplyTempWarm,
      returnAirTemp: body.returnAirTemp,
      outdoorTemp: body.outdoorTemp,
      indoorRH: body.indoorRH,
      suctionPressure: body.suctionPressure,
      dischargePressure: body.dischargePressure,
      superheat: body.superheat,
      subcooling: body.subcooling,
      motorAmps: body.motorAmps,
      ratedAmps: body.ratedAmps,
      capacitorMicrofarads: body.capacitorMicrofarads,
      ratedCapacitorMicrofarads: body.ratedCapacitorMicrofarads,
      staticPressureSupply: body.staticPressureSupply,
      staticPressureReturn: body.staticPressureReturn,
      cfmMeasured: body.cfmMeasured,
      cfmDesign: body.cfmDesign,
      lastFilterChange: body.lastFilterChange,
      lastCoilCleaning: body.lastCoilCleaning,
      lastRefrigerantService: body.lastRefrigerantService,
    };

    const result = runDiagnostic(input);
    return NextResponse.json({ result });
  } catch (error) {
    console.error('POST /api/diagnostics error:', error);
    return NextResponse.json(
      { error: 'Diagnostic analysis failed', description: String(error) },
      { status: 500 },
    );
  }
}
