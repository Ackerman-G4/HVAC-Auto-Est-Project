import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

interface RoomConfig {
  name: string;
  spaceType: string;
  area: number;
  occupantCount: number;
  lightingDensity: number;
  equipmentLoad: number;
  windowArea: number;
  windowOrientation: string;
  windowType: string;
  wallConstruction: string;
  ceilingHeight: number;
  hasRoofExposure?: boolean;
  equipModel?: string;
  equipQty?: number;
}

interface FloorConfig {
  floorNumber: number;
  name: string;
  rooms: RoomConfig[];
}

function computeCoolingLoad(roomCfg: RoomConfig) {
  const outdoorDB = 35;
  const indoorDB = 24;
  const dt = outdoorDB - indoorDB;

  const wallArea = Math.sqrt(roomCfg.area) * roomCfg.ceilingHeight * 2;
  const wallLoad = wallArea * 2.9 * 12;
  const roofLoad = roomCfg.hasRoofExposure ? roomCfg.area * 1.8 * 25 : 0;
  const glassCond = roomCfg.windowArea * 5.8 * dt;
  const glassSolar = roomCfg.windowArea * 0.82 * 300;
  const peopleSens = roomCfg.occupantCount * 75;
  const peopleLat = roomCfg.occupantCount * 55;
  const lighting = roomCfg.area * roomCfg.lightingDensity;
  const equip = roomCfg.area * roomCfg.equipmentLoad;
  const ventSens = roomCfg.occupantCount * 20 * 0.000472 * 1.2 * 1006 * dt;
  const ventLat = roomCfg.occupantCount * 20 * 0.000472 * 1.2 * 2501000 * 0.005;

  const sensible = wallLoad + roofLoad + glassCond + glassSolar + peopleSens + lighting + equip + ventSens;
  const latent = peopleLat + ventLat;
  const total = (sensible + latent) * 1.1;
  const tr = total / 3517;

  return {
    wallLoad: Math.round(wallLoad),
    roofLoad: Math.round(roofLoad),
    glassSolarLoad: Math.round(glassSolar),
    glassConductionLoad: Math.round(glassCond),
    lightingLoad: Math.round(lighting),
    peopleLoadSensible: Math.round(peopleSens),
    peopleLoadLatent: Math.round(peopleLat),
    equipmentLoadSensible: Math.round(equip),
    ventilationLoadSensible: Math.round(ventSens),
    ventilationLoadLatent: Math.round(ventLat),
    totalSensibleLoad: Math.round(sensible),
    totalLatentLoad: Math.round(latent),
    totalLoad: Math.round(total),
    trValue: parseFloat(tr.toFixed(2)),
    btuPerHour: Math.round(total * 3.412),
    cfmSupply: Math.round(sensible / (1.2 * 1006 * 11.1) / 0.000472),
    cfmFreshAir: roomCfg.occupantCount * 20,
    safetyFactor: 1.1,
    diversityFactor: 0.85,
    calculationMethod: 'CLTD_CLF',
  };
}

async function main() {
  const projectName = 'TEMP - Quick Test Project';

  const existing = await prisma.project.findFirst({
    where: { name: projectName, status: { not: 'archived' } },
    select: { id: true, name: true, status: true },
  });

  const project = existing
    ? await prisma.project.update({
      where: { id: existing.id },
      data: {
        status: 'draft',
        totalFloorArea: 260,
        floorsAboveGrade: 2,
      },
      select: { id: true, name: true, status: true, createdAt: true },
    })
    : await prisma.project.create({
      data: {
        name: projectName,
        clientName: 'Internal Testing',
        location: 'Manila',
        city: 'Manila',
        buildingType: 'office',
        status: 'draft',
        totalFloorArea: 260,
        floorsAboveGrade: 2,
        floorsBelowGrade: 0,
        outdoorDB: 35,
        outdoorWB: 28,
        outdoorRH: 65,
        indoorDB: 24,
        indoorRH: 50,
        notes: 'Temporary project for quick UI and API testing.',
      },
      select: { id: true, name: true, status: true, createdAt: true },
    });

  const floorConfigs: FloorConfig[] = [
    {
      floorNumber: 1,
      name: 'Ground Floor',
      rooms: [
        {
          name: 'Reception',
          spaceType: 'lobby',
          area: 40,
          occupantCount: 6,
          lightingDensity: 14,
          equipmentLoad: 10,
          windowArea: 8,
          windowOrientation: 'N',
          windowType: 'double_tinted_6mm',
          wallConstruction: 'concrete_150mm',
          ceilingHeight: 3,
          equipModel: 'FTKF50BVM',
          equipQty: 1,
        },
        {
          name: 'Open Office',
          spaceType: 'office',
          area: 95,
          occupantCount: 16,
          lightingDensity: 16,
          equipmentLoad: 22,
          windowArea: 12,
          windowOrientation: 'E',
          windowType: 'double_tinted_6mm',
          wallConstruction: 'concrete_150mm',
          ceilingHeight: 2.8,
          equipModel: 'FCF71CVM',
          equipQty: 2,
        },
        {
          name: 'Meeting Room',
          spaceType: 'conference',
          area: 25,
          occupantCount: 10,
          lightingDensity: 14,
          equipmentLoad: 12,
          windowArea: 4,
          windowOrientation: 'W',
          windowType: 'single_clear_6mm',
          wallConstruction: 'concrete_150mm',
          ceilingHeight: 2.8,
          equipModel: 'FTKF35BVM',
          equipQty: 1,
        },
      ],
    },
    {
      floorNumber: 2,
      name: 'Second Floor',
      rooms: [
        {
          name: 'Manager Office',
          spaceType: 'office',
          area: 24,
          occupantCount: 2,
          lightingDensity: 12,
          equipmentLoad: 15,
          windowArea: 5,
          windowOrientation: 'S',
          windowType: 'double_clear_6mm',
          wallConstruction: 'concrete_150mm',
          ceilingHeight: 2.8,
          hasRoofExposure: true,
          equipModel: 'FTKF35BVM',
          equipQty: 1,
        },
        {
          name: 'Server Room',
          spaceType: 'server_room',
          area: 16,
          occupantCount: 0,
          lightingDensity: 10,
          equipmentLoad: 420,
          windowArea: 0,
          windowOrientation: 'N',
          windowType: 'single_clear_6mm',
          wallConstruction: 'concrete_150mm',
          ceilingHeight: 2.8,
          hasRoofExposure: true,
          equipModel: 'FTKF71BVM',
          equipQty: 1,
        },
      ],
    },
  ];

  const requiredEquipment = [
    {
      manufacturer: 'Daikin',
      model: 'FTKF35BVM',
      type: 'wall_split',
      capacityTR: 1.0,
      capacityBTU: 12000,
      capacityKW: 3.5,
      powerInputKW: 0.97,
      currentAmps: 4.8,
      phase: '1-phase',
      voltage: 220,
      refrigerant: 'R32',
      eer: 12.4,
      cop: 3.61,
      liquidPipeSize: '1/4',
      gasPipeSize: '3/8',
      maxPipeLength: 15,
      maxElevation: 10,
      unitPricePHP: 38000,
    },
    {
      manufacturer: 'Daikin',
      model: 'FTKF50BVM',
      type: 'wall_split',
      capacityTR: 1.5,
      capacityBTU: 18000,
      capacityKW: 5.0,
      powerInputKW: 1.45,
      currentAmps: 7.2,
      phase: '1-phase',
      voltage: 220,
      refrigerant: 'R32',
      eer: 12.0,
      cop: 3.45,
      liquidPipeSize: '1/4',
      gasPipeSize: '1/2',
      maxPipeLength: 20,
      maxElevation: 12,
      unitPricePHP: 48000,
    },
    {
      manufacturer: 'Daikin',
      model: 'FTKF71BVM',
      type: 'wall_split',
      capacityTR: 2.0,
      capacityBTU: 24000,
      capacityKW: 7.1,
      powerInputKW: 2.1,
      currentAmps: 10.5,
      phase: '1-phase',
      voltage: 220,
      refrigerant: 'R32',
      eer: 11.5,
      cop: 3.38,
      liquidPipeSize: '3/8',
      gasPipeSize: '5/8',
      maxPipeLength: 20,
      maxElevation: 12,
      unitPricePHP: 58000,
    },
    {
      manufacturer: 'Daikin',
      model: 'FCF71CVM',
      type: 'ceiling_cassette',
      capacityTR: 2.0,
      capacityBTU: 24000,
      capacityKW: 7.1,
      powerInputKW: 2.2,
      currentAmps: 11,
      phase: '1-phase',
      voltage: 220,
      refrigerant: 'R32',
      eer: 10.9,
      cop: 3.23,
      liquidPipeSize: '3/8',
      gasPipeSize: '5/8',
      maxPipeLength: 30,
      maxElevation: 15,
      unitPricePHP: 82000,
    },
  ];

  for (const equipment of requiredEquipment) {
    const existingEquipment = await prisma.equipment.findFirst({
      where: { model: equipment.model },
      select: { id: true },
    });

    if (!existingEquipment) {
      await prisma.equipment.create({
        data: {
          ...equipment,
          indoorDimensions: '',
          outdoorDimensions: '',
          indoorWeight: 0,
          outdoorWeight: 0,
        },
      });
    }
  }

  const allEquipment = await prisma.equipment.findMany({
    select: { id: true, model: true },
  });
  const equipByModel: Record<string, string> = {};
  for (const eq of allEquipment) {
    equipByModel[eq.model] = eq.id;
  }

  let floorsCreated = 0;
  let roomsCreated = 0;
  let loadsCreated = 0;
  let selectionsCreated = 0;

  for (const floorCfg of floorConfigs) {
    let floor = await prisma.floor.findFirst({
      where: {
        projectId: project.id,
        floorNumber: floorCfg.floorNumber,
      },
      select: { id: true },
    });

    if (!floor) {
      floor = await prisma.floor.create({
        data: {
          projectId: project.id,
          floorNumber: floorCfg.floorNumber,
          name: floorCfg.name,
          ceilingHeight: floorCfg.rooms[0]?.ceilingHeight ?? 2.8,
        },
        select: { id: true },
      });
      floorsCreated++;
    }

    for (const roomCfg of floorCfg.rooms) {
      let room = await prisma.room.findFirst({
        where: {
          floorId: floor.id,
          name: roomCfg.name,
        },
        select: { id: true },
      });

      if (!room) {
        room = await prisma.room.create({
          data: {
            floorId: floor.id,
            name: roomCfg.name,
            spaceType: roomCfg.spaceType,
            area: roomCfg.area,
            occupantCount: roomCfg.occupantCount,
            lightingDensity: roomCfg.lightingDensity,
            equipmentLoad: roomCfg.equipmentLoad,
            windowArea: roomCfg.windowArea,
            windowOrientation: roomCfg.windowOrientation,
            windowType: roomCfg.windowType,
            wallConstruction: roomCfg.wallConstruction,
            ceilingHeight: roomCfg.ceilingHeight,
            hasRoofExposure: roomCfg.hasRoofExposure ?? false,
          },
          select: { id: true },
        });
        roomsCreated++;
      }

      const existingLoad = await prisma.coolingLoad.findUnique({
        where: { roomId: room.id },
        select: { id: true },
      });

      if (!existingLoad) {
        await prisma.coolingLoad.create({
          data: {
            roomId: room.id,
            ...computeCoolingLoad(roomCfg),
          },
        });
        loadsCreated++;
      }

      const eqId = roomCfg.equipModel ? equipByModel[roomCfg.equipModel] : undefined;
      if (eqId) {
        const existingSelection = await prisma.selectedEquipment.findFirst({
          where: {
            roomId: room.id,
            equipmentId: eqId,
          },
          select: { id: true },
        });

        if (!existingSelection) {
          await prisma.selectedEquipment.create({
            data: {
              roomId: room.id,
              equipmentId: eqId,
              quantity: roomCfg.equipQty ?? 1,
            },
          });
          selectionsCreated++;
        }
      }
    }
  }

  console.log(existing ? `ℹ️ Temp project updated: ${project.name}` : `✅ Temp project created: ${project.name}`);
  console.log(project);
  console.log(`  Floors added: ${floorsCreated}`);
  console.log(`  Rooms added: ${roomsCreated}`);
  console.log(`  Cooling loads added: ${loadsCreated}`);
  console.log(`  Equipment selections added: ${selectionsCreated}`);
}

main()
  .catch((error) => {
    console.error('❌ Failed to create temp project');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
