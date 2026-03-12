/**
 * Equipment Selection API
 * GET  /api/projects/[id]/equipment — Get selected equipment
 * POST /api/projects/[id]/equipment — Auto-size + select equipment
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db/firebase-admin';
import { sizeEquipment } from '@/lib/functions/equipment-sizing';
import { INVERTER_EER_THRESHOLD } from '@/lib/utils/constants';
import { errorResponse, getErrorDetails, getUserId, getAuthToken, checkProjectAccess } from '@/lib/utils/api-helpers';

type RouteContext = { params: Promise<{ id: string }> };

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

    const [selectionsSnap, equipmentSnap] = await Promise.all([
      adminDb.ref(`projectData/${projectId}/equipmentSelection`).once('value'),
      adminDb.ref(`projectData/${projectId}/equipment`).once('value'),
    ]);

    const selections = selectionsSnap.val() || {};
    const equipmentLib = equipmentSnap.val() || {};

    const equipment = Object.entries(selections).map(([id, sel]: [string, any]) => {
      const equip = equipmentLib[sel.equipmentId] || {};
      const unitPrice = equip.unitPricePHP || 0;
      const quantity = sel.quantity || 0;
      const eer = equip.eer || 0;

      return {
        id,
        roomId: sel.roomId,
        brand: equip.manufacturer || '',
        model: equip.model || '',
        type: equip.type || '',
        capacityTR: equip.capacityTR || 0,
        capacityBTU: equip.capacityBTU || 0,
        quantity,
        unitPrice,
        totalPrice: unitPrice * quantity,
        eer,
        isInverter: eer >= INVERTER_EER_THRESHOLD,
        refrigerant: equip.refrigerant || '',
      };
    });

    return NextResponse.json({ equipment });
  } catch (error) {
    console.error('GET equipment error:', error);
    const d = getErrorDetails(error, 'Failed to fetch equipment');
    return errorResponse(500, d.error, d.description, d.code);
  }
}

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

    const body = await request.json();

    if (body.autoSize) {
      const [floorsSnap, roomsSnap, loadsSnap] = await Promise.all([
        adminDb.ref(`projectData/${projectId}/floors`).once('value'),
        adminDb.ref(`projectData/${projectId}/rooms`).once('value'),
        adminDb.ref(`projectData/${projectId}/coolingLoads`).once('value'),
      ]);

      const floors = floorsSnap.val() || {};
      const rooms = roomsSnap.val() || {};
      const loads = loadsSnap.val() || {};

      const allRooms = Object.entries(rooms).map(([id, r]: [string, any]) => ({ id, ...r, coolingLoad: loads[id] }));
      if (allRooms.length === 0) {
        return errorResponse(400, 'No rooms found', 'Add rooms to the project before auto-sizing equipment.', 'NO_ROOMS');
      }

      const roomsWithLoads = allRooms.filter((r) => r.coolingLoad);
      if (roomsWithLoads.length === 0) {
        return errorResponse(400, 'No cooling loads calculated', 'Run "Calculate" first to compute cooling loads for all rooms before auto-sizing equipment.', 'NO_LOADS');
      }

      const results: any[] = [];
      const updates: Record<string, any> = {};

      // Clear existing selections
      updates[`projectData/${projectId}/equipmentSelection`] = null;

      for (const room of allRooms) {
        if (!room.coolingLoad) continue;

        const sizing = sizeEquipment({
          totalLoadWatts: room.coolingLoad.totalLoad,
          trValue: room.coolingLoad.trValue,
          btuPerHour: room.coolingLoad.btuPerHour,
          spaceType: room.spaceType,
          roomArea: room.area,
          ceilingHeight: room.ceilingHeight,
          budgetLevel: body.budgetLevel || 'mid-range',
          preferredBrand: body.preferredBrand,
          preferredType: body.preferredType,
        });

        if (sizing.recommended.length > 0) {
          const top = sizing.recommended[0];
          const avgPrice = (top.equipment.priceMin + top.equipment.priceMax) / 2;
          const eer = top.equipment.eer || 10;

          const equipmentId = top.equipment.id;
          const equipmentData = {
            manufacturer: top.equipment.brand,
            model: top.equipment.model,
            type: top.equipment.type,
            capacityTR: top.equipment.capacityTR,
            capacityBTU: top.equipment.capacityBTU,
            capacityKW: top.equipment.capacityKW,
            powerInputKW: top.equipment.capacityKW / eer,
            currentAmps: 0,
            phase: top.equipment.powerSupply?.includes('3') ? '3-phase' : '1-phase',
            voltage: top.equipment.powerSupply?.includes('380') ? 380 : 220,
            refrigerant: top.equipment.refrigerant || 'R32',
            eer,
            cop: eer / 3.412,
            unitPricePHP: avgPrice,
          };

          updates[`projectData/${projectId}/equipment/${equipmentId}`] = equipmentData;

          const selectionRef = adminDb.ref(`projectData/${projectId}/equipmentSelection`).push();
          const selectionId = selectionRef.key!;
          updates[`projectData/${projectId}/equipmentSelection/${selectionId}`] = {
            roomId: room.id,
            equipmentId,
            quantity: top.quantity,
          };

          results.push({
            room: room.name,
            equipment: {
              id: selectionId,
              brand: top.equipment.brand,
              model: top.equipment.model,
              type: top.equipment.type,
              capacityTR: top.equipment.capacityTR,
              quantity: top.quantity,
            },
            alternatives: sizing.alternatives.slice(0, 3),
          });
        }
      }

      await adminDb.ref().update(updates);
      return NextResponse.json({ results }, { status: 201 });
    }

    // Manual equipment selection
    const eer = body.eer || 10;
    const equipmentId = body.equipmentId || adminDb.ref(`projectData/${projectId}/equipment`).push().key!;
    const equipmentData = {
      manufacturer: body.brand || '',
      model: body.model || '',
      type: body.type || 'wall_split',
      capacityTR: body.capacityTR || (body.capacityBTU ? body.capacityBTU / 12000 : 0),
      capacityBTU: body.capacityBTU || 0,
      capacityKW: (body.capacityBTU || 0) * 0.000293,
      powerInputKW: 0,
      currentAmps: 0,
      refrigerant: body.refrigerant || 'R32',
      eer,
      cop: eer / 3.412,
      unitPricePHP: body.unitPrice || 0,
    };

    const selectionRef = adminDb.ref(`projectData/${projectId}/equipmentSelection`).push();
    const selectionId = selectionRef.key!;
    
    const updates: Record<string, any> = {};
    updates[`projectData/${projectId}/equipment/${equipmentId}`] = equipmentData;
    updates[`projectData/${projectId}/equipmentSelection/${selectionId}`] = {
      roomId: body.roomId,
      equipmentId,
      quantity: body.quantity || 1,
    };

    await adminDb.ref().update(updates);

    return NextResponse.json({ 
      equipment: { id: selectionId, ...updates[`projectData/${projectId}/equipmentSelection/${selectionId}`] } 
    }, { status: 201 });
  } catch (error) {
    console.error('POST equipment error:', error);
    const d = getErrorDetails(error, 'Failed to select equipment');
    return errorResponse(500, d.error, d.description, d.code);
  }
}
