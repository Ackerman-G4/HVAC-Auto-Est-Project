/**
 * BOQ API — Generate and manage Bill of Quantities
 * GET  /api/projects/[id]/boq — Get BOQ items
 * POST /api/projects/[id]/boq — Generate BOQ from selections
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/guard';
import {
  listBoqItemsForProject,
  listSelectedEquipmentForProject,
  replaceBoqItemsForProject,
} from '@/lib/firebase/project-estimation-store';
import {
  getFloorsWithRooms,
  getProjectRecord,
  updateProjectRecord,
  writeAuditLog,
} from '@/lib/firebase/projects-store';
import { compileBOQ } from '@/lib/functions/cost-engine';
import { sizeRefrigerantPipe, sizeCondensatePipe } from '@/lib/functions/pipe-sizing';
import { sizeElectrical } from '@/lib/functions/electrical';
import { errorResponse, getErrorDetails, resourceNotFound } from '@/lib/utils/api-helpers';
import { finalizeDualValue } from '@/lib/utils/dual-control';
import type { BOQItem } from '@/types/material';

/** Default estimated run lengths (metres) */
const DEFAULT_REFRIGERANT_RUN_M = 10;
const DEFAULT_ELEVATION_DIFF_M = 3;
const DEFAULT_ELECTRICAL_RUN_M = 15;
const DEFAULT_CONDENSATE_RUN_M = 5;

const DEFAULT_PRICING_POLICY = {
  laborMultiplier: 0.35,
  overheadPercent: 0.15,
  contingencyPercent: 0.05,
  vatRate: 0.12,
} as const;

type RouteContext = { params: Promise<{ id: string }> };

type ProjectPricing = {
  suggestedLaborMultiplier: number;
  laborMultiplierOverride: number | null;
  suggestedOverheadPercent: number;
  overheadPercentOverride: number | null;
  suggestedContingencyPercent: number;
  contingencyPercentOverride: number | null;
  suggestedVatRate: number;
  vatRateOverride: number | null;
};

function resolvePricingPolicy(project: ProjectPricing | null) {
  return {
    laborMultiplier: finalizeDualValue(
      project?.suggestedLaborMultiplier ?? DEFAULT_PRICING_POLICY.laborMultiplier,
      project?.laborMultiplierOverride
    ),
    overheadPercent: finalizeDualValue(
      project?.suggestedOverheadPercent ?? DEFAULT_PRICING_POLICY.overheadPercent,
      project?.overheadPercentOverride
    ),
    contingencyPercent: finalizeDualValue(
      project?.suggestedContingencyPercent ?? DEFAULT_PRICING_POLICY.contingencyPercent,
      project?.contingencyPercentOverride
    ),
    vatRate: finalizeDualValue(
      project?.suggestedVatRate ?? DEFAULT_PRICING_POLICY.vatRate,
      project?.vatRateOverride
    ),
  };
}

/* ──────────────────────── GET ──────────────────────── */

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id } = await context.params;
    const [project, items] = await Promise.all([
      getProjectRecord(id),
      listBoqItemsForProject(id),
    ]);

    if (!project) {
      return resourceNotFound('Project', 'The project does not exist.', 'PROJECT_NOT_FOUND');
    }

    const pricingPolicy = resolvePricingPolicy(project);

    const getSuggestedUnitPrice = (item: (typeof items)[number]) =>
      item.suggestedUnitPrice === 0 ? item.unitPrice : item.suggestedUnitPrice;
    const getFinalUnitPrice = (item: (typeof items)[number]) =>
      item.finalUnitPrice === 0
        ? (item.userUnitPriceOverride ?? item.unitPrice)
        : item.finalUnitPrice;
    const getFinalTotalPrice = (item: (typeof items)[number]) =>
      item.finalTotalPrice === 0
        ? getFinalUnitPrice(item) * item.quantity
        : item.finalTotalPrice;

    const sumByCategory = (cat: string) =>
      items
        .filter((i) => i.category === cat)
        .reduce((sum, i) => sum + getFinalTotalPrice(i), 0);

    const equipmentCost = sumByCategory('equipment');
    const materialCost = sumByCategory('material');
    const laborCost = sumByCategory('labor');
    const subtotal = equipmentCost + materialCost + laborCost;
    const overhead = subtotal * pricingPolicy.overheadPercent.final;
    const contingency = subtotal * pricingPolicy.contingencyPercent.final;
    const beforeVAT = subtotal + overhead + contingency;
    const vat = beforeVAT * pricingPolicy.vatRate.final;
    const grandTotal = beforeVAT + vat;

    // TR from equipment description strings
    let totalCapacityTR = 0;
    for (const i of items.filter((i) => i.category === 'equipment')) {
      const m = i.description.match(/(\d+\.?\d*)\s*TR/);
      if (m) totalCapacityTR += parseFloat(m[1]) * i.quantity;
    }
    const costPerTR = totalCapacityTR > 0 ? grandTotal / totalCapacityTR : 0;

    return NextResponse.json({
      items: items.map((i) => ({
        id: i.id,
        section: i.section,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        suggestedUnitPrice: getSuggestedUnitPrice(i),
        suggestedTotalPrice:
          i.suggestedTotalPrice === 0
            ? getSuggestedUnitPrice(i) * i.quantity
            : i.suggestedTotalPrice,
        userUnitPriceOverride: i.userUnitPriceOverride,
        userTotalPriceOverride: i.userTotalPriceOverride,
        finalUnitPrice: getFinalUnitPrice(i),
        finalTotalPrice: getFinalTotalPrice(i),
        unitPrice: getFinalUnitPrice(i),
        totalPrice: getFinalTotalPrice(i),
        sourceState: i.sourceState,
        isOverridden: i.isOverridden,
        overrideReason: i.overrideReason,
        category: i.category,
        floorName: i.notes || '',
      })),
      equipmentCost: Math.round(equipmentCost),
      materialCost: Math.round(materialCost),
      laborCost: Math.round(laborCost),
      overhead: Math.round(overhead),
      contingency: Math.round(contingency),
      subtotal: Math.round(subtotal),
      vat: Math.round(vat),
      grandTotal: Math.round(grandTotal),
      costPerTR: Math.round(costPerTR),
      pricingPolicy: {
        laborMultiplier: {
          suggested: pricingPolicy.laborMultiplier.suggested,
          override: pricingPolicy.laborMultiplier.override,
          final: pricingPolicy.laborMultiplier.final,
          isOverridden: pricingPolicy.laborMultiplier.isOverridden,
        },
        overheadPercent: {
          suggested: pricingPolicy.overheadPercent.suggested,
          override: pricingPolicy.overheadPercent.override,
          final: pricingPolicy.overheadPercent.final,
          isOverridden: pricingPolicy.overheadPercent.isOverridden,
        },
        contingencyPercent: {
          suggested: pricingPolicy.contingencyPercent.suggested,
          override: pricingPolicy.contingencyPercent.override,
          final: pricingPolicy.contingencyPercent.final,
          isOverridden: pricingPolicy.contingencyPercent.isOverridden,
        },
        vatRate: {
          suggested: pricingPolicy.vatRate.suggested,
          override: pricingPolicy.vatRate.override,
          final: pricingPolicy.vatRate.final,
          isOverridden: pricingPolicy.vatRate.isOverridden,
        },
      },
    });
  } catch (error) {
    console.error('GET BOQ error:', error);
    const d = getErrorDetails(error, 'Failed to fetch BOQ');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

/* ──────────── helpers for BOQ input construction ──────────── */

interface SelEquip {
  equipment: {
    manufacturer: string;
    model: string;
    type: string;
    capacityTR: number;
    capacityBTU: number;
    capacityKW: number;
    refrigerant: string;
    eer: number;
    unitPricePHP: number;
  };
  quantity: number;
  floorName: string;
}

function buildBOQInputs(selections: SelEquip[]) {
  return {
    equipment: selections.map((s) => ({
      brand: s.equipment.manufacturer,
      model: s.equipment.model,
      type: s.equipment.type,
      quantity: s.quantity,
      unitPriceMin: s.equipment.unitPricePHP * 0.9,
      unitPriceMax: s.equipment.unitPricePHP * 1.1,
      capacityTR: s.equipment.capacityTR,
    })),
    refrigerantPipes: selections.map((s) => ({
      result: sizeRefrigerantPipe({
        capacityBTU: s.equipment.capacityBTU,
        refrigerantType: (s.equipment.refrigerant as 'R410A' | 'R32' | 'R22' | 'R134a') || 'R32',
        lineLength: DEFAULT_REFRIGERANT_RUN_M,
        elevationDiff: DEFAULT_ELEVATION_DIFF_M,
      }),
      runLengthM: DEFAULT_REFRIGERANT_RUN_M,
    })),
    electrical: selections.map((s) => {
      const powerKW = s.equipment.capacityBTU * 0.000293 / (s.equipment.eer || 10);
      return sizeElectrical({
        equipmentPowerKW: powerKW,
        voltage: s.equipment.capacityTR > 3 ? 380 : 220,
        phase: s.equipment.capacityTR > 3 ? 3 : 1,
        powerFactor: 0.9,
        runLength: DEFAULT_ELECTRICAL_RUN_M,
        ambientTemp: 35,
        conduitType: 'PVC',
      });
    }),
    condensate: selections.map((s) => ({
      result: sizeCondensatePipe(s.equipment.capacityTR),
      runLengthM: DEFAULT_CONDENSATE_RUN_M,
    })),
  };
}

/* ──────────────────────── POST ──────────────────────── */

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) {
      return auth.response;
    }

    const { id: projectId } = await context.params;

    const project = await getProjectRecord(projectId);

    if (!project) {
      return resourceNotFound('Project', 'The project does not exist.', 'PROJECT_NOT_FOUND');
    }

    const pricingPolicy = resolvePricingPolicy(project);

    const [floors, selectedRecords] = await Promise.all([
      getFloorsWithRooms(projectId),
      listSelectedEquipmentForProject(projectId),
    ]);

    const roomFloorMap = new Map<string, string>();
    floors.forEach((floor) => {
      floor.rooms.forEach((room) => {
        roomFloorMap.set(room.id, floor.name || 'Unassigned');
      });
    });

    const selectedEquipment: SelEquip[] = selectedRecords.map((sel) => ({
      equipment: sel.equipment,
      quantity: sel.quantity,
      floorName: roomFloorMap.get(sel.roomId) || 'Unassigned',
    }));

    if (selectedEquipment.length === 0) {
      return errorResponse(400, 'No equipment selected', 'Please select equipment first.', 'NO_EQUIPMENT');
    }

    // Build per-floor items using the shared helper
    const allItems: BOQItem[] = [];
    const floorGroups = new Map<string, typeof selectedEquipment>();
    for (const s of selectedEquipment) {
      const arr = floorGroups.get(s.floorName);
      if (arr) arr.push(s); else floorGroups.set(s.floorName, [s]);
    }

    for (const [floorName, floorEquipment] of floorGroups) {
      const floorBOQ = compileBOQ({
        ...buildBOQInputs(floorEquipment),
        laborMultiplier: pricingPolicy.laborMultiplier.final,
        overheadPercent: pricingPolicy.overheadPercent.final,
        contingencyPercent: pricingPolicy.contingencyPercent.final,
        vatRate: pricingPolicy.vatRate.final,
      });
      for (const item of floorBOQ.items) {
        allItems.push({ ...item, floorName });
      }
    }

    // Build overall summary once (reuse same helper)
    const overallBOQ = compileBOQ({
      ...buildBOQInputs(selectedEquipment),
      laborMultiplier: pricingPolicy.laborMultiplier.final,
      overheadPercent: pricingPolicy.overheadPercent.final,
      contingencyPercent: pricingPolicy.contingencyPercent.final,
      vatRate: pricingPolicy.vatRate.final,
    });
    const boqSummary = { ...overallBOQ, items: allItems };

    await replaceBoqItemsForProject(
      projectId,
      boqSummary.items.map((item) => ({
        section: item.section,
        description: item.description,
        specification: item.specification || '',
        quantity: item.quantity,
        unit: item.unit,
        suggestedUnitPrice: item.unitPrice,
        suggestedTotalPrice: item.totalPrice,
        userUnitPriceOverride: null,
        userTotalPriceOverride: null,
        finalUnitPrice: item.unitPrice,
        finalTotalPrice: item.totalPrice,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        sourceState: 'suggested',
        isOverridden: false,
        overrideReason: '',
        notes: item.floorName || '',
        category: item.category,
      })),
    );

    const totalFloorArea = floors.reduce(
      (acc, floor) => acc + floor.rooms.reduce((roomSum, room) => roomSum + (room.area || 0), 0),
      0,
    );

    await updateProjectRecord(projectId, {
      totalFloorArea,
      isBoqStale: false,
      lastBoqGeneratedAt: new Date().toISOString(),
    });

    await writeAuditLog({
      projectId,
      action: 'generated',
      entity: 'boq',
      entityId: projectId,
      details: JSON.stringify({
        itemCount: boqSummary.items.length,
        grandTotal: boqSummary.grandTotal,
        pricingPolicy: {
          laborMultiplier: pricingPolicy.laborMultiplier.final,
          overheadPercent: pricingPolicy.overheadPercent.final,
          contingencyPercent: pricingPolicy.contingencyPercent.final,
          vatRate: pricingPolicy.vatRate.final,
        },
      }),
    });

    return NextResponse.json({ boq: boqSummary }, { status: 201 });
  } catch (error) {
    console.error('POST BOQ error:', error);
    const d = getErrorDetails(error, 'Failed to generate BOQ');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
