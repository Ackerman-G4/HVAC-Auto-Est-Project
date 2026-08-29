/**
 * Admin Equipment Price Override API
 * GET    /api/admin/prices — List catalog prices with active overrides
 * POST   /api/admin/prices — Set a justified, capped price override
 * DELETE /api/admin/prices — Clear a price override
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import { EQUIPMENT_CATALOG } from '@/constants/equipment-catalog';
import {
  deletePriceOverride,
  getPriceOverridesByModel,
  upsertPriceOverride,
  writePriceAuditEntry,
} from '@/lib/firebase/price-override-store';
import { writeAuditLog } from '@/lib/firebase/projects-store';
import {
  errorResponse,
  getErrorDetails,
  requireJsonRequest,
  resourceNotFound,
} from '@/lib/utils/api-helpers';
import {
  clearOverrideSchema,
  getAdminValidationError,
  priceOverrideRequestSchema,
} from '@/lib/validation/admin';
import { logger } from '@/lib/observability/logger';

const PRICE_CAP_RATIO = 0.5;

const ADMIN_PRICES_GET_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

const ADMIN_PRICES_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 10,
} as const;

function findCatalogEntry(model: string) {
  return EQUIPMENT_CATALOG.find((entry) => entry.model === model) || null;
}

export async function GET(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'admin-prices-get', ADMIN_PRICES_GET_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request, { allowedRoles: ['admin'] });
    if (!auth.authorized) {
      return auth.response;
    }

    const overrides = await getPriceOverridesByModel();

    const prices = EQUIPMENT_CATALOG.map((entry) => {
      const override = overrides.get(entry.model);
      return {
        manufacturer: entry.manufacturer,
        model: entry.model,
        type: entry.type,
        capacityTR: entry.capacityTR,
        catalogPricePhp: entry.unitPricePHP,
        overridePricePhp: override ? override.overridePricePhp : null,
        effectivePricePhp: override ? override.overridePricePhp : entry.unitPricePHP,
        justification: override ? override.justification : null,
        setBy: override ? override.setBy : null,
        updatedAt: override ? override.updatedAt : null,
      };
    });

    return NextResponse.json({ prices });
  } catch (error) {
    logger.error('GET /api/admin/prices error', error);
    const d = getErrorDetails(error, 'Failed to fetch equipment prices');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function POST(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'admin-prices-post', ADMIN_PRICES_MUTATION_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request, { allowedRoles: ['admin'] });
    if (!auth.authorized) {
      return auth.response;
    }

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const body = await request.json();
    const parsed = priceOverrideRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: getAdminValidationError(parsed.error) }, { status: 400 });
    }

    const payload = parsed.data;
    const catalogEntry = findCatalogEntry(payload.model);

    if (!catalogEntry) {
      return resourceNotFound('Equipment', `No catalog equipment matches model "${payload.model}".`);
    }

    const minAllowedPhp = catalogEntry.unitPricePHP * (1 - PRICE_CAP_RATIO);
    const maxAllowedPhp = catalogEntry.unitPricePHP * (1 + PRICE_CAP_RATIO);

    if (payload.overridePricePhp < minAllowedPhp || payload.overridePricePhp > maxAllowedPhp) {
      return errorResponse(
        422,
        'Price override exceeds allowed cap',
        `Override for ${catalogEntry.model} must stay within 50% of the catalog price of PHP ${catalogEntry.unitPricePHP} (allowed band: PHP ${minAllowedPhp} to PHP ${maxAllowedPhp}).`,
        'PRICE_CAP_EXCEEDED',
      );
    }

    const existingOverrides = await getPriceOverridesByModel();
    const existingOverride = existingOverrides.get(catalogEntry.model) || null;
    const oldPricePhp = existingOverride ? existingOverride.overridePricePhp : catalogEntry.unitPricePHP;

    const override = await upsertPriceOverride({
      manufacturer: catalogEntry.manufacturer,
      model: catalogEntry.model,
      basePricePhp: catalogEntry.unitPricePHP,
      overridePricePhp: payload.overridePricePhp,
      justification: payload.justification,
      setBy: auth.user.id,
      setByEmail: auth.user.email,
    });

    await writePriceAuditEntry({
      model: catalogEntry.model,
      manufacturer: catalogEntry.manufacturer,
      oldPricePhp,
      newPricePhp: override.overridePricePhp,
      justification: payload.justification,
      adminUid: auth.user.id,
      adminEmail: auth.user.email,
      action: 'override_set',
    });

    await writeAuditLog({
      projectId: 'system',
      action: 'price_override',
      entity: 'equipment_price',
      entityId: catalogEntry.model,
      details: payload.justification,
      previousValue: JSON.stringify({ pricePhp: oldPricePhp }),
      newValue: JSON.stringify({ pricePhp: override.overridePricePhp }),
    });

    return NextResponse.json({ override });
  } catch (error) {
    logger.error('POST /api/admin/prices error', error);
    const d = getErrorDetails(error, 'Failed to set price override');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const rateLimit = evaluateRateLimit(request, 'admin-prices-delete', ADMIN_PRICES_MUTATION_RATE_LIMIT);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSec) } },
      );
    }

    const auth = await requireAuth(request, { allowedRoles: ['admin'] });
    if (!auth.authorized) {
      return auth.response;
    }

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const body = await request.json();
    const parsed = clearOverrideSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: getAdminValidationError(parsed.error) }, { status: 400 });
    }

    const removed = await deletePriceOverride(parsed.data.model);

    if (!removed) {
      return resourceNotFound(
        'Price override',
        `No price override exists for model "${parsed.data.model}".`,
      );
    }

    const catalogEntry = findCatalogEntry(removed.model);
    const revertedPricePhp = catalogEntry ? catalogEntry.unitPricePHP : removed.basePricePhp;

    await writePriceAuditEntry({
      model: removed.model,
      manufacturer: removed.manufacturer,
      oldPricePhp: removed.overridePricePhp,
      newPricePhp: revertedPricePhp,
      justification: '',
      adminUid: auth.user.id,
      adminEmail: auth.user.email,
      action: 'override_cleared',
    });

    await writeAuditLog({
      projectId: 'system',
      action: 'price_override_cleared',
      entity: 'equipment_price',
      entityId: removed.model,
      details: JSON.stringify({
        actorId: auth.user.id,
        actorEmail: auth.user.email,
      }),
      previousValue: JSON.stringify({ pricePhp: removed.overridePricePhp }),
      newValue: JSON.stringify({ pricePhp: revertedPricePhp }),
    });

    return NextResponse.json({ cleared: true, model: removed.model });
  } catch (error) {
    logger.error('DELETE /api/admin/prices error', error);
    const d = getErrorDetails(error, 'Failed to clear price override');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
