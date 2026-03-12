/**
 * Diagnostics API — Firebase RTDB implementation
 * POST /api/diagnostics
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { runDiagnostic } from '@/lib/functions/diagnostic';
import {
  errorResponse,
  getErrorDetails,
  getUserId,
} from '@/lib/utils/api-helpers';

export async function POST(request: NextRequest) {
  try {
    const uid = await getUserId(request);
    if (!uid) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to run diagnostics.', 'UNAUTHORIZED');
    }

    const body = await request.json();
    const { inputs } = body;

    if (!inputs) {
      return errorResponse(400, 'Missing fields', 'Inputs are required for diagnostics.', 'MISSING_FIELDS');
    }

    const result = runDiagnostic(inputs);

    // Save to history
    const now = new Date().toISOString();
    await adminDb.ref(`users/${uid}/diagnostics`).push({
      type: inputs.systemType,
      inputs,
      result,
      timestamp: now,
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error('POST /api/diagnostics error:', error);
    const d = getErrorDetails(error, 'Failed to run diagnostic');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
