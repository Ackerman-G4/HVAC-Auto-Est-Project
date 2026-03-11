/**
 * BOQ API — Generate and manage Bill of Quantities
 * GET  /api/projects/[id]/boq — Get BOQ items
 * POST /api/projects/[id]/boq — Generate BOQ from selections
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { compileBOQ } from '@/lib/functions/cost-engine';
import { sizeRefrigerantPipe, sizeCondensatePipe } from '@/lib/functions/pipe-sizing';
import { sizeElectrical } from '@/lib/functions/electrical';
import { errorResponse, getErrorDetails, getUserId, getAuthToken, checkProjectAccess } from '@/lib/utils/api-helpers';
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
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to access this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const itemsSnap = await adminDb.ref(`projectData/${projectId}/boq`).once('value');
    const itemsVal = itemsSnap.val() || {};
    const items = Object.entries(itemsVal).map(([id, item]: [string, any]) => ({ id, ...item }));

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
        id: i.id,
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
    const token = await getAuthToken(request);
    if (!token) {
      return errorResponse(401, 'Unauthorized', 'You must be logged in to access this resource.', 'UNAUTHORIZED');
    }

    const { id: projectId } = await context.params;
    const ownerId = await checkProjectAccess(projectId, token);
    
    if (!ownerId) {
      return errorResponse(403, 'Forbidden', 'You do not have access to this project.', 'FORBIDDEN');
    }

    const uid = token.uid;

    const [floorsSnap, roomsSnap, selectionsSnap, equipmentSnap] = await Promise.all([
      adminDb.ref(`projectData/${projectId}/floors`).once('value'),
      adminDb.ref(`projectData/${projectId}/rooms`).once('value'),
      adminDb.ref(`projectData/${projectId}/equipmentSelection`).once('value'),
      adminDb.ref(`projectData/${projectId}/equipment`).once('value'),
    ]);

    const floors = floorsSnap.val() || {};
    const rooms = roomsSnap.val() || {};
    const selections = selectionsSnap.val() || {};
    const equipmentLib = equipmentSnap.val() || {};

    const selectedEquipment = Object.entries(selections).map(([id, sel]: [string, any]) => {
      const room = rooms[sel.roomId] || {};
      const floor = floors[room.floorId] || {};
      const equip = equipmentLib[sel.equipmentId] || {};
      
      return {
        ...sel,
        equipment: equip,
        floorName: floor.name || 'Unknown Floor',
        floorNumber: floor.floorNumber || 0,
      };
    });

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

    // Persist
    const updates: Record<string, any> = {};
    updates[`projectData/${projectId}/boq`] = null; // Clear old items

    boqSummary.items.forEach((item) => {
      const itemRef = adminDb.ref(`projectData/${projectId}/boq`).push();
      updates[`projectData/${projectId}/boq/${itemRef.key}`] = {
        section: item.section,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        category: item.category,
        notes: item.floorName,
      };
    });

    // Update project total floor area
    const totalArea = Object.values(rooms).reduce((sum: number, r: any) => sum + (r.area || 0), 0);
    updates[`projectData/${projectId}/metadata/totalFloorArea`] = totalArea;

    // Audit log
    const logRef = adminDb.ref(`auditLogs/${uid}`).push();
    updates[`auditLogs/${uid}/${logRef.key}`] = {
      projectId,
      action: 'generated',
      entity: 'boq',
      entityId: projectId,
      details: JSON.stringify({
        itemCount: boqSummary.items.length,
        grandTotal: boqSummary.grandTotal,
      }),
      timestamp: Date.now(),
    };

    await adminDb.ref().update(updates);

    return NextResponse.json({ boq: boqSummary }, { status: 201 });
  } catch (error) {
    console.error('POST BOQ error:', error);
    const d = getErrorDetails(error, 'Failed to generate BOQ');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
