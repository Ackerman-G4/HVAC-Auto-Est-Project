/**
 * Calculation API — Run or re-run cooling load calculations
 * POST /api/projects/[id]/calculate
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { calculateCoolingLoad } from '@/lib/functions/cooling-load';
import type { CoolingLoadInput } from '@/types/calculation';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: projectId } = await context.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        floors: {
          include: {
            rooms: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({
        error: 'Project not found',
        description: 'The project ID does not match any existing project.',
        code: 'PROJECT_NOT_FOUND',
      }, { status: 404 });
    }

    const allRooms = project.floors.flatMap((f) => f.rooms);
    if (allRooms.length === 0) {
      return NextResponse.json({
        error: 'No rooms to calculate',
        description: 'Add rooms to the project before running cooling load calculations.',
        code: 'NO_ROOMS',
      }, { status: 400 });
    }

    const results = [];
    let totalProjectLoad = 0;
    let totalProjectTR = 0;

    for (const floor of project.floors) {
      for (const room of floor.rooms) {
        if (room.area <= 0) continue;

        const perimeter = Math.sqrt(room.area) * 4;
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

        // Upsert cooling load
        await prisma.coolingLoad.upsert({
          where: { roomId: room.id },
          create: {
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
          update: {
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

        totalProjectLoad += loadResult.totalLoad;
        totalProjectTR += loadResult.trValue;
        results.push(loadResult);
      }
    }

    await prisma.auditLog.create({
      data: {
        projectId,
        action: 'calculated',
        entity: 'cooling_load',
        entityId: projectId,
        details: JSON.stringify({
          roomCount: results.length,
          totalTR: Math.round(totalProjectTR * 100) / 100,
        }),
      },
    });

    return NextResponse.json({
      results,
      summary: {
        roomCount: results.length,
        totalLoadWatts: Math.round(totalProjectLoad),
        totalTR: Math.round(totalProjectTR * 100) / 100,
        totalBTU: Math.round(totalProjectLoad * 3.412),
      },
    });
  } catch (error) {
    console.error('POST calculate error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      error: 'Failed to calculate cooling loads',
      description: `Server error during calculation: ${message}`,
      code: 'CALC_ERROR',
    }, { status: 500 });
  }
}
