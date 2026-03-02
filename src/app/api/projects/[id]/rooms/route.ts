/**
 * Rooms API — CRUD + Cooling Load Calculation
 * POST /api/projects/[id]/rooms — Create room
 * GET  /api/projects/[id]/rooms — List rooms
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { calculateCoolingLoad } from '@/lib/functions/cooling-load';
import type { CoolingLoadInput } from '@/types/calculation';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const floors = await prisma.floor.findMany({
      where: { projectId: id },
      include: {
        rooms: {
          include: { coolingLoad: true },
        },
      },
      orderBy: { floorNumber: 'asc' },
    });

    return NextResponse.json({ floors });
  } catch (error) {
    console.error('GET rooms error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      error: 'Failed to fetch rooms',
      description: `Server error: ${message}`,
      code: 'ROOMS_FETCH_ERROR',
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;
    const body = await request.json();

    // Verify project exists
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Find or create floor
    let floor = await prisma.floor.findFirst({
      where: { projectId, floorNumber: body.floorNumber || 1 },
    });

    if (!floor) {
      floor = await prisma.floor.create({
        data: {
          projectId,
          floorNumber: body.floorNumber || 1,
          name: body.floorName || `Floor ${body.floorNumber || 1}`,
          ceilingHeight: body.ceilingHeight || 2.7,
        },
      });
    }

    // Create room
    const room = await prisma.room.create({
      data: {
        floorId: floor.id,
        name: body.name || 'New Room',
        spaceType: body.spaceType || 'office',
        area: body.area || 0,
        ceilingHeight: body.ceilingHeight || floor.ceilingHeight,
        wallConstruction: body.wallConstruction || 'concrete_block_200mm',
        windowType: body.windowType || 'single_clear_6mm',
        windowArea: body.windowArea || 0,
        windowOrientation: body.windowOrientation || 'N',
        occupantCount: body.occupantCount || 0,
        lightingDensity: body.lightingDensity || 15,
        equipmentLoad: body.equipmentLoad || 10,
        hasRoofExposure: body.hasRoofExposure || false,
        notes: body.notes || '',
      },
    });

    // Calculate cooling load if sufficient data
    if (room.area > 0) {
      const perimeter = Math.sqrt(room.area) * 4; // approximate
      const wallArea = perimeter * room.ceilingHeight - room.windowArea;

      const loadInput: CoolingLoadInput = {
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

      const loadResult = calculateCoolingLoad(loadInput, room.id, room.name);

      await prisma.coolingLoad.create({
        data: {
          roomId: room.id,
          wallLoad: loadResult.wallLoad,
          roofLoad: loadResult.roofLoad,
          glassSolarLoad: loadResult.glassSolarLoad,
          glassConductionLoad: loadResult.glassConductionLoad,
          lightingLoad: loadResult.lightingLoad,
          peopleLoadSensible: loadResult.peopleLoadSensible,
          peopleLoadLatent: loadResult.peopleLoadLatent,
          equipmentLoadSensible: loadResult.equipmentLoadSensible,
          infiltrationLoadSensible: loadResult.infiltrationLoadSensible,
          infiltrationLoadLatent: loadResult.infiltrationLoadLatent,
          ventilationLoadSensible: loadResult.ventilationLoadSensible,
          ventilationLoadLatent: loadResult.ventilationLoadLatent,
          totalSensibleLoad: loadResult.totalSensibleLoad,
          totalLatentLoad: loadResult.totalLatentLoad,
          totalLoad: loadResult.totalLoad,
          trValue: loadResult.trValue,
          btuPerHour: loadResult.btuPerHour,
          cfmSupply: loadResult.cfmSupply,
          cfmReturn: loadResult.cfmReturn,
          cfmExhaust: loadResult.cfmExhaust,
          safetyFactor: loadResult.safetyFactor,
          calculationMethod: loadResult.calculationMethod,
        },
      });
    }

    // Fetch created room with cooling load
    const createdRoom = await prisma.room.findUnique({
      where: { id: room.id },
      include: { coolingLoad: true },
    });

    return NextResponse.json({ room: createdRoom }, { status: 201 });
  } catch (error) {
    console.error('POST rooms error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      error: 'Failed to create room',
      description: `Server error during room creation: ${message}`,
      code: 'ROOM_ERROR',
    }, { status: 500 });
  }
}
