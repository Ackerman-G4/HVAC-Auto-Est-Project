/**
 * Diagnostics API — POST /api/diagnostics
 * Accepts system info + symptoms, returns ranked fault analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { runDiagnostic } from '@/lib/functions/diagnostic';
import { createDiagnosticHistory } from '@/lib/firebase/catalog-store';
import { internalServerError, requireJsonRequest } from '@/lib/utils/api-helpers';
import {
  diagnosticsRequestSchema,
  getDiagnosticsValidationError,
} from '@/lib/validation/diagnostics';
import type { DiagnosticInput } from '@/types/diagnostic';

const DIAGNOSTICS_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 8,
} as const;

export async function POST(request: NextRequest) {
  try {
    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const rateLimit = evaluateRateLimit(request, 'diagnostics-run', DIAGNOSTICS_RATE_LIMIT);
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

    const payload = await request.json();
    const parsed = diagnosticsRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json({ error: getDiagnosticsValidationError(parsed.error) }, { status: 400 });
    }

    const body = parsed.data;

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

    // Persist diagnostic run to history
    try {
      await createDiagnosticHistory({
        userId: auth.user.id,
        userEmail: auth.user.email,
        systemType: input.systemType,
        payload: JSON.stringify(input),
        result: JSON.stringify(result),
        faultCount: result.faults?.length ?? 0,
        maxSeverity: result.faults?.[0]?.severity ?? 'info',
      });
    } catch (persistError) {
      console.warn('Failed to persist diagnostic history:', persistError);
      // Non-blocking — still return result
    }

    return NextResponse.json({ result });
  } catch (error) {
    console.error('POST /api/diagnostics error:', error);
    return internalServerError('Diagnostic analysis failed');
  }
}
