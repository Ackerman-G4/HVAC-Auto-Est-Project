/**
 * Shared API route helpers.
 * Consolidates error handling, type coercion, and cooling‑load input
 * building so every route uses the same logic.
 */

import { NextResponse } from 'next/server';
import type { CoolingLoadInput } from '@/types/calculation';

// ── Type‑safe coercion ──────────────────────────────────────

/** Parse `value` to a finite number or return `fallback`. */
export function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/** Parse `value` to a finite integer or return `fallback`. */
export function toInt(value: unknown, fallback: number): number {
  return Math.trunc(toNumber(value, fallback));
}

// ── Error helpers ───────────────────────────────────────────

interface ApiErrorBody {
  error: string;
  description: string;
  code: string;
}

/** Return a consistent JSON error response. */
export function errorResponse(
  status: number,
  error: string,
  description: string,
  code?: string,
) {
  return NextResponse.json(
    { error, description, code: code ?? `API_${status}` } satisfies ApiErrorBody,
    { status },
  );
}

/**
 * Extract a structured error from an unknown catch value.
 * Handles Prisma error codes (P2002 / P2003 / P2025),
 * JSON parse errors, and generic Error objects.
 */
export function getErrorDetails(
  error: unknown,
  fallbackMessage: string,
): ApiErrorBody {
  if (error instanceof SyntaxError) {
    return {
      error: 'Invalid request payload',
      description: 'The request body is not valid JSON.',
      code: 'INVALID_JSON',
    };
  }

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;
    const code = typeof obj.code === 'string' ? obj.code : '';
    const msg = typeof obj.message === 'string' ? obj.message : '';

    const prismaMap: Record<string, { error: string; description: string }> = {
      P2002: { error: 'Duplicate record', description: 'A record with the same unique value already exists.' },
      P2003: { error: 'Invalid relation reference', description: 'A related record referenced by this request does not exist.' },
      P2025: { error: 'Record not found', description: 'The target record was not found.' },
    };

    if (code in prismaMap) {
      return { ...prismaMap[code], code };
    }

    if (msg) {
      return { error: fallbackMessage, description: msg, code: code || 'UNKNOWN_ERROR' };
    }
  }

  return {
    error: fallbackMessage,
    description: 'An unexpected server error occurred.',
    code: 'UNKNOWN_ERROR',
  };
}

// ── Cooling‑load input builder ──────────────────────────────

interface RoomLike {
  area: number;
  ceilingHeight: number;
  windowArea: number;
  wallConstruction: string;
  windowType: string;
  windowOrientation: string;
  hasRoofExposure: boolean;
  occupantCount: number;
  lightingDensity: number;
  equipmentLoad: number;
  spaceType: string;
}

interface ProjectLike {
  outdoorDB: number;
  outdoorWB: number;
  outdoorRH: number;
  indoorDB: number;
  indoorRH: number;
  safetyFactor: number;
  diversityFactor: number;
}

/**
 * Build a `CoolingLoadInput` from a room + project record.
 *
 * Uses length & width if available; otherwise approximates the
 * perimeter from √area × 4 (square‑room assumption) as a fallback.
 */
export function buildCoolingLoadInput(
  room: RoomLike & { length?: number; width?: number; perimeter?: number },
  project: ProjectLike,
): CoolingLoadInput {
  // Use stored perimeter first, then actual dimensions, otherwise approximate
  const perimeter =
    room.perimeter && room.perimeter > 0
      ? room.perimeter
      : room.length && room.width
        ? 2 * (room.length + room.width)
        : Math.sqrt(room.area) * 4;

  const wallArea = perimeter * room.ceilingHeight - room.windowArea;

  return {
    roomArea: room.area,
    ceilingHeight: room.ceilingHeight,
    wallArea,
    wallConstruction: room.wallConstruction,
    windowArea: room.windowArea,
    windowType: room.windowType,
    windowOrientation: room.windowOrientation,
    roofArea: room.hasRoofExposure ? room.area : 0,
    occupantCount: room.occupantCount,
    lightingDensity: room.lightingDensity,
    equipmentLoad: room.equipmentLoad,
    spaceType: room.spaceType,
    outdoorDB: project.outdoorDB,
    outdoorWB: project.outdoorWB,
    outdoorRH: project.outdoorRH,
    indoorDB: project.indoorDB,
    indoorRH: project.indoorRH,
    safetyFactor: project.safetyFactor,
    diversityFactor: project.diversityFactor,
    roomPerimeter: perimeter,
  };
}

/**
 * Map a `CoolingLoadResult` to a flat object suitable for
 * `prisma.coolingLoad.create / update / upsert`.
 */
export function coolingLoadToDbFields(r: {
  wallLoad: number;
  roofLoad: number;
  glassSolarLoad: number;
  glassConductionLoad: number;
  lightingLoad: number;
  peopleLoadSensible: number;
  peopleLoadLatent: number;
  equipmentLoadSensible: number;
  infiltrationLoadSensible: number;
  infiltrationLoadLatent: number;
  ventilationLoadSensible: number;
  ventilationLoadLatent: number;
  totalSensibleLoad: number;
  totalLatentLoad: number;
  totalLoad: number;
  trValue: number;
  btuPerHour: number;
  cfmSupply: number;
  cfmReturn: number;
  cfmExhaust: number;
  safetyFactor: number;
  calculationMethod: string;
}) {
  return {
    wallLoad: r.wallLoad,
    roofLoad: r.roofLoad,
    glassSolarLoad: r.glassSolarLoad,
    glassConductionLoad: r.glassConductionLoad,
    lightingLoad: r.lightingLoad,
    peopleLoadSensible: r.peopleLoadSensible,
    peopleLoadLatent: r.peopleLoadLatent,
    equipmentLoadSensible: r.equipmentLoadSensible,
    infiltrationLoadSensible: r.infiltrationLoadSensible,
    infiltrationLoadLatent: r.infiltrationLoadLatent,
    ventilationLoadSensible: r.ventilationLoadSensible,
    ventilationLoadLatent: r.ventilationLoadLatent,
    totalSensibleLoad: r.totalSensibleLoad,
    totalLatentLoad: r.totalLatentLoad,
    totalLoad: r.totalLoad,
    trValue: r.trValue,
    btuPerHour: r.btuPerHour,
    cfmSupply: r.cfmSupply,
    cfmReturn: r.cfmReturn,
    cfmExhaust: r.cfmExhaust,
    safetyFactor: r.safetyFactor,
    calculationMethod: r.calculationMethod,
  };
}
