/**
 * BOQ API — Generate and manage Bill of Quantities
 * GET  /api/projects/[id]/boq — Get BOQ items
 * POST /api/projects/[id]/boq — Generate BOQ from selections
 */

import { NextRequest, NextResponse } from 'next/server';
import neon from '@/lib/db/prisma';
import { compileBOQ } from '@/lib/functions/cost-engine';
import { sizeRefrigerantPipe, sizeCondensatePipe } from '@/lib/functions/pipe-sizing';
import { sizeElectrical } from '@/lib/functions/electrical';
import { errorResponse, getErrorDetails } from '@/lib/utils/api-helpers';
import type { BOQItem } from '@/types/material';

/** Default estimated run lengths (metres) */
const DEFAULT_REFRIGERANT_RUN_M = 10;
const DEFAULT_ELEVATION_DIFF_M = 3;
const DEFAULT_ELECTRICAL_RUN_M = 15;
const DEFAULT_CONDENSATE_RUN_M = 5;

type RouteContext = { params: Promise<{ id: string }> };

/* ──────────────────────── GET ──────────────────────── */

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const items = await neon.bOQItem.findMany({
      where: { projectId: id },
      orderBy: { section: 'asc' },
    });
    const sumByCategory = (cat: string) =>
      items.filter((i) => i.category === cat).reduce((s, i) => s + i.totalPrice, 0);

    const equipmentCost = sumByCategory('equipment');
    const materialCost = sumByCategory('material');
    const laborCost = sumByCategory('labor');
    const subtotal = equipmentCost + materialCost + laborCost;
    const overhead = subtotal * 0.15;
    const contingency = subtotal * 0.05;
    const beforeVAT = subtotal + overhead + contingency;
    const vat = beforeVAT * 0.12;
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
        section: i.section,
        description: i.description,
        quantity: i.quantity,
        unit: i.unit,
        unitPrice: i.unitPrice,
        totalPrice: i.totalPrice,
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
    const { id: projectId } = await context.params;

    const floors = await neon.floor.findMany({
      where: { projectId },
      orderBy: { floorNumber: 'asc' },
      include: {
        rooms: {
          include: { selectedEquipment: { include: { equipment: true } } },
        },
      },
    });

    const selectedEquipment = floors.flatMap((f) =>
      f.rooms.flatMap((r) =>
        r.selectedEquipment.map((sel) => ({
          ...sel,
          equipment: sel.equipment,
          floorName: f.name,
          floorNumber: f.floorNumber,
        }))
      )
    );

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
      const floorBOQ = compileBOQ(buildBOQInputs(floorEquipment));
      for (const item of floorBOQ.items) {
        allItems.push({ ...item, floorName });
      }
    }

    // Build overall summary once (reuse same helper)
    const overallBOQ = compileBOQ(buildBOQInputs(selectedEquipment));
    const boqSummary = { ...overallBOQ, items: allItems };

    // Persist — wrap delete+create in a transaction for atomicity
    await neon.$transaction(async (tx) => {
      await tx.bOQItem.deleteMany({ where: { projectId } });

      await tx.bOQItem.createMany({
        data: boqSummary.items.map((item) => ({
          projectId,
          section: item.section,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          category: item.category,
        })),
      });

      // Update project total floor area
      await tx.project.update({
        where: { id: projectId },
        data: {
          totalFloorArea: (await tx.room.aggregate({
            where: { floor: { projectId } },
            _sum: { area: true },
          }))._sum.area || 0,
        },
      });

      await tx.auditLog.create({
        data: {
          projectId,
          action: 'generated',
          entity: 'boq',
          entityId: projectId,
          details: JSON.stringify({
            itemCount: boqSummary.items.length,
            grandTotal: boqSummary.grandTotal,
          }),
        },
      });
    });

    return NextResponse.json({ boq: boqSummary }, { status: 201 });
  } catch (error) {
    console.error('POST BOQ error:', error);
    const d = getErrorDetails(error, 'Failed to generate BOQ');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
