/**
 * Diagnostic History API — Firebase RTDB implementation
 * GET /api/diagnostics/history
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import {
  errorResponse,
  getErrorDetails,
  getUserId,
} from '@/lib/utils/api-helpers';

export async function GET(request: NextRequest) {
  try {
    const uid = await getUserId(request);
    if (!uid) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to view history.', 'UNAUTHORIZED');
    }

    const historyRef = adminDb.ref(`users/${uid}/diagnostics`);
    const snapshot = await historyRef.orderByChild('timestamp').limitToLast(50).once('value');
    
    const data = snapshot.val() || {};
    const history = Object.keys(data).map(id => ({
      id,
      ...data[id]
    })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return NextResponse.json({ history });
  } catch (error) {
    console.error('GET /api/diagnostics/history error:', error);
    const d = getErrorDetails(error, 'Failed to fetch diagnostic history');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
