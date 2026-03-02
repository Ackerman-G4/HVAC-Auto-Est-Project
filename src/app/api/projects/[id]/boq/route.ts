/**
 * BOQ API — Generate and manage Bill of Quantities
 * GET  /api/projects/[id]/boq — Get BOQ items
 * POST /api/projects/[id]/boq — Generate BOQ from selections
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { compileBOQ } from '@/lib/functions/cost-engine';
import { sizeRefrigerantPipe, sizeCondensatePipe } from '@/lib/functions/pipe-sizing';
import { sizeElectrical } from '@/lib/functions/electrical';
import type { BOQItem } from '@/types/material';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const items = await prisma.bOQItem.findMany({
      where: { projectId: id },
      orderBy: { section: 'asc' },
    });

    // Compute summary from stored items
    const equipmentCost = items
      .filter((i) => i.category === 'equipment')
      .reduce((sum, i) => sum + i.totalPrice, 0);
    const materialCost = items
      .filter((i) => i.category === 'material')
      .reduce((sum, i) => sum + i.totalPrice, 0);
    const laborCost = items
      .filter((i) => i.category === 'labor')
      .reduce((sum, i) => sum + i.totalPrice, 0);
    const subtotal = equipmentCost + materialCost + laborCost;
    const overhead = subtotal * 0.15;
    const contingency = subtotal * 0.05;
    const beforeVAT = subtotal + overhead + contingency;
    const vat = beforeVAT * 0.12;
    const grandTotal = beforeVAT + vat;

    // Compute total TR from equipment descriptions
    let totalCapacityTR = 0;
    items.filter((i) => i.category === 'equipment').forEach((i) => {
      const trMatch = i.description.match(/(\d+\.?\d*)\s*TR/);
      if (trMatch) totalCapacityTR += parseFloat(trMatch[1]) * i.quantity;
    });
    const costPerTR = totalCapacityTR > 0 ? grandTotal / totalCapacityTR : 0;

    // Map items with floorName from notes field
    const mappedItems = items.map((i) => ({
      section: i.section,
      description: i.description,
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unitPrice,
      totalPrice: i.totalPrice,
      category: i.category,
      floorName: i.notes || '',
    }));

    return NextResponse.json({
      items: mappedItems,
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      error: 'Failed to fetch BOQ',
      description: `Server error: ${message}`,
      code: 'BOQ_FETCH_ERROR',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;

    // Get selected equipment with equipment details via rooms, organised by floor
    const floors = await prisma.floor.findMany({
      where: { projectId },
      orderBy: { floorNumber: 'asc' },
      include: {
        rooms: {
          include: {
            selectedEquipment: {
              include: { equipment: true },
            },
          },
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
      return NextResponse.json(
        { error: 'No equipment selected. Please select equipment first.' },
        { status: 400 }
      );
    }

    // Group equipment by floor for floor-level BOQ
    const floorGroups = new Map<string, typeof selectedEquipment>();
    for (const sel of selectedEquipment) {
      const key = sel.floorName;
      if (!floorGroups.has(key)) floorGroups.set(key, []);
      floorGroups.get(key)!.push(sel);
    }

    // Compile BOQ per floor
    const allItems: BOQItem[] = [];
    let firstFloorSummary: ReturnType<typeof compileBOQ> | null = null;

    for (const [floorName, floorEquipment] of floorGroups) {
      const equipmentInputs = floorEquipment.map((sel) => ({
        brand: sel.equipment.manufacturer,
        model: sel.equipment.model,
        type: sel.equipment.type,
        quantity: sel.quantity,
        unitPriceMin: sel.equipment.unitPricePHP * 0.9,
        unitPriceMax: sel.equipment.unitPricePHP * 1.1,
        capacityTR: sel.equipment.capacityTR,
      }));

      const refrigerantPipes = floorEquipment.map((sel) => ({
        result: sizeRefrigerantPipe({
          capacityBTU: sel.equipment.capacityBTU,
          refrigerantType: (sel.equipment.refrigerant as 'R410A' | 'R32' | 'R22' | 'R134a') || 'R32',
          lineLength: 10,
          elevationDiff: 3,
        }),
        runLengthM: 10,
      }));

      const electricalInputs = floorEquipment.map((sel) => {
        const powerKW = sel.equipment.capacityBTU * 0.000293 / (sel.equipment.eer || 10);
        return sizeElectrical({
          equipmentPowerKW: powerKW,
          voltage: sel.equipment.capacityTR > 3 ? 380 : 220,
          phase: sel.equipment.capacityTR > 3 ? 3 : 1,
          powerFactor: 0.90,
          runLength: 15,
          ambientTemp: 35,
          conduitType: 'PVC',
        });
      });

      const condensate = floorEquipment.map((sel) => ({
        result: sizeCondensatePipe(sel.equipment.capacityTR),
        runLengthM: 5,
      }));

      const floorBOQ = compileBOQ({
        equipment: equipmentInputs,
        refrigerantPipes,
        electrical: electricalInputs,
        condensate,
      });

      if (!firstFloorSummary) firstFloorSummary = floorBOQ;

      // Tag each item with floor name
      for (const item of floorBOQ.items) {
        allItems.push({ ...item, floorName });
      }
    }

    // Build overall summary
    const boqSummaryResult = compileBOQ({
      equipment: selectedEquipment.map((sel) => ({
        brand: sel.equipment.manufacturer,
        model: sel.equipment.model,
        type: sel.equipment.type,
        quantity: sel.quantity,
        unitPriceMin: sel.equipment.unitPricePHP * 0.9,
        unitPriceMax: sel.equipment.unitPricePHP * 1.1,
        capacityTR: sel.equipment.capacityTR,
      })),
      refrigerantPipes: selectedEquipment.map((sel) => ({
        result: sizeRefrigerantPipe({
          capacityBTU: sel.equipment.capacityBTU,
          refrigerantType: (sel.equipment.refrigerant as 'R410A' | 'R32' | 'R22' | 'R134a') || 'R32',
          lineLength: 10,
          elevationDiff: 3,
        }),
        runLengthM: 10,
      })),
      electrical: selectedEquipment.map((sel) => {
        const powerKW = sel.equipment.capacityBTU * 0.000293 / (sel.equipment.eer || 10);
        return sizeElectrical({
          equipmentPowerKW: powerKW,
          voltage: sel.equipment.capacityTR > 3 ? 380 : 220,
          phase: sel.equipment.capacityTR > 3 ? 3 : 1,
          powerFactor: 0.90,
          runLength: 15,
          ambientTemp: 35,
          conduitType: 'PVC',
        });
      }),
      condensate: selectedEquipment.map((sel) => ({
        result: sizeCondensatePipe(sel.equipment.capacityTR),
        runLengthM: 5,
      })),
    });

    // Use floor-tagged items but keep overall summary totals
    const boqSummary = { ...boqSummaryResult, items: allItems };

    // Clear existing BOQ for this project
    await prisma.bOQItem.deleteMany({ where: { projectId } });

    // Save BOQ items with floor name in notes field
    for (const item of boqSummary.items) {
      await prisma.bOQItem.create({
        data: {
          projectId,
          section: item.section,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          category: item.category,
          notes: item.floorName || '',
        },
      });
    }

    // Update project total
    await prisma.project.update({
      where: { id: projectId },
      data: {
        totalFloorArea: (await prisma.room.aggregate({
          where: { floor: { projectId } },
          _sum: { area: true },
        }))._sum.area || 0,
      },
    });

    await prisma.auditLog.create({
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

    return NextResponse.json({ boq: boqSummary }, { status: 201 });
  } catch (error) {
    console.error('POST BOQ error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      error: 'Failed to generate BOQ',
      description: `Server error during BOQ generation: ${message}`,
      code: 'BOQ_ERROR',
    }, { status: 500 });
  }
}
