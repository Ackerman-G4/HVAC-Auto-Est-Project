/**
 * Individual BOQ Item API — Update + Delete
 * PUT    /api/projects/[id]/boq/[itemId] — Update BOQ item
 * DELETE /api/projects/[id]/boq/[itemId] — Delete BOQ item
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import { parseJsonBody } from '@/lib/validation/http';
import { updateBoqItemSchema } from '@/lib/validation/boq';
import { evaluateRateLimit } from '@/lib/auth/rate-limit';
import {
  deleteBoqItemRecord,
  getBoqItemRecord,
  listBoqItemsForProject,
  updateBoqItemRecord,
} from '@/lib/firebase/project-estimation-store';
import { createBoqSnapshot } from '@/lib/firebase/boq-snapshot-store';
import { getProjectRecord, writeAuditLog } from '@/lib/firebase/projects-store';
import { computeBoqGrandTotal, computeBoqHash } from '@/lib/functions/boq-integrity';
import { errorResponse, getErrorDetails, requireJsonRequest, resourceNotFound } from '@/lib/utils/api-helpers';
import { finalizeDualValue } from '@/lib/utils/dual-control';

type RouteContext = { params: Promise<{ id: string; itemId: string }> };

const BOQ_ITEM_MUTATION_RATE_LIMIT = {
  windowMs: 60_000,
  maxRequests: 30,
} as const;

const DEFAULT_PRICING_RATES = {
  overheadPercent: 0.15,
  contingencyPercent: 0.05,
  vatRate: 0.12,
} as const;

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-boq-item-put', BOQ_ITEM_MUTATION_RATE_LIMIT);
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

    const { id: projectId, itemId } = await context.params;

    const jsonGuard = requireJsonRequest(request);
    if (jsonGuard) {
      return jsonGuard;
    }

    const parsed = await parseJsonBody(request, updateBoqItemSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    const existing = await getBoqItemRecord(itemId);
    if (!existing || existing.projectId !== projectId) {
      return resourceNotFound('BOQ item', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
    }

    const quantity = body.quantity ?? existing.quantity;
    const suggestedUnitPrice = body.suggestedUnitPrice ?? existing.suggestedUnitPrice ?? existing.unitPrice;
    const clearOverride = body.useSuggested === true || body.userUnitPriceOverride === null || body.unitPrice === null;
    const userUnitPriceOverride = clearOverride
      ? null
      : (body.userUnitPriceOverride ?? body.unitPrice ?? existing.userUnitPriceOverride);
    const resolvedUnitPrice = finalizeDualValue(suggestedUnitPrice, userUnitPriceOverride);
    const suggestedTotalPrice = suggestedUnitPrice * quantity;
    const userTotalPriceOverride = resolvedUnitPrice.isOverridden ? resolvedUnitPrice.final * quantity : null;
    const finalTotalPrice = resolvedUnitPrice.final * quantity;

    const item = await updateBoqItemRecord(itemId, {
      description: body.description ?? existing.description,
      specification: body.specification ?? existing.specification,
      quantity,
      unit: body.unit ?? existing.unit,
      suggestedUnitPrice,
      suggestedTotalPrice,
      userUnitPriceOverride,
      userTotalPriceOverride,
      finalUnitPrice: resolvedUnitPrice.final,
      finalTotalPrice,
      unitPrice: resolvedUnitPrice.final,
      totalPrice: finalTotalPrice,
      sourceState: resolvedUnitPrice.source,
      isOverridden: resolvedUnitPrice.isOverridden,
      overrideReason: resolvedUnitPrice.isOverridden ? (body.overrideReason ?? existing.overrideReason) : '',
      overrideUpdatedAt: resolvedUnitPrice.isOverridden ? new Date().toISOString() : null,
      notes: body.notes ?? existing.notes,
    });

    if (!item) {
      return resourceNotFound('BOQ item', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
    }

    const [project, currentItems] = await Promise.all([
      getProjectRecord(projectId),
      listBoqItemsForProject(projectId),
    ]);
    const boqHash = computeBoqHash(currentItems);
    const grandTotalPhp = computeBoqGrandTotal(currentItems, {
      overheadPercent: finalizeDualValue(
        project?.suggestedOverheadPercent ?? DEFAULT_PRICING_RATES.overheadPercent,
        project?.overheadPercentOverride,
      ).final,
      contingencyPercent: finalizeDualValue(
        project?.suggestedContingencyPercent ?? DEFAULT_PRICING_RATES.contingencyPercent,
        project?.contingencyPercentOverride,
      ).final,
      vatRate: finalizeDualValue(
        project?.suggestedVatRate ?? DEFAULT_PRICING_RATES.vatRate,
        project?.vatRateOverride,
      ).final,
    });
    const snapshot = await createBoqSnapshot({
      projectId,
      eventType: 'item_override',
      boqHash,
      itemCount: currentItems.length,
      grandTotalPhp,
      triggeredBy: auth.user.id,
    });

    await writeAuditLog({
      projectId,
      action: 'updated',
      entity: 'boq_item',
      entityId: itemId,
      details: JSON.stringify({
        boqHash,
        snapshot: {
          id: snapshot.id,
          algorithm: snapshot.algorithm,
          itemCount: snapshot.itemCount,
          grandTotalPhp: snapshot.grandTotalPhp,
          deltaPhp: snapshot.deltaPhp,
          createdAt: snapshot.createdAt,
        },
      }),
      previousValue: JSON.stringify({
        quantity: existing.quantity,
        unitPrice: existing.finalUnitPrice ?? existing.unitPrice,
        totalPrice: existing.finalTotalPrice ?? existing.totalPrice,
        isOverridden: existing.isOverridden,
      }),
      newValue: JSON.stringify({
        quantity: item.quantity,
        unitPrice: item.finalUnitPrice ?? item.unitPrice,
        totalPrice: item.finalTotalPrice ?? item.totalPrice,
        isOverridden: item.isOverridden,
      }),
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error('PUT BOQ item error:', error);
    const d = getErrorDetails(error, 'Failed to update BOQ item');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const rateLimit = evaluateRateLimit(request, 'projects-id-boq-item-delete', BOQ_ITEM_MUTATION_RATE_LIMIT);
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

    const { id: projectId, itemId } = await context.params;

    const existing = await getBoqItemRecord(itemId);
    if (!existing || existing.projectId !== projectId) {
      return resourceNotFound('BOQ item', 'The item does not exist in this project.', 'BOQ_ITEM_NOT_FOUND');
    }

    await deleteBoqItemRecord(itemId);

    return NextResponse.json({ message: 'BOQ item deleted' });
  } catch (error) {
    console.error('DELETE BOQ item error:', error);
    const d = getErrorDetails(error, 'Failed to delete BOQ item');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
