/**
 * Database Seed Script
 * Populates the database with sample project, rooms, equipment, and materials
 * Run: npm run db:seed
 */

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import path from 'path';

const dbPath = path.join(process.cwd(), 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // ── Suppliers ──────────────────────────────────────────────────────────

  const supplier1 = await prisma.supplier.create({
    data: {
      name: 'Carrier Philippines',
      type: 'national',
      website: 'https://www.carrier.com/commercial/en/ph/',
      location: 'Makati City, Metro Manila',
      contactInfo: '+63 2 8892 0101',
      coverageArea: 'Nationwide',
      categories: JSON.stringify(['refrigerant_pipe', 'controls', 'duct_accessory']),
    },
  });

  const supplier2 = await prisma.supplier.create({
    data: {
      name: 'Daikin Philippines',
      type: 'national',
      website: 'https://www.daikin.com.ph/',
      location: 'Pasig City, Metro Manila',
      contactInfo: '+63 2 8635 8888',
      coverageArea: 'Nationwide',
      categories: JSON.stringify(['refrigerant_pipe', 'refrigerant', 'controls']),
    },
  });

  const supplier3 = await prisma.supplier.create({
    data: {
      name: 'Metalaire Philippines',
      type: 'national',
      website: 'https://metalaire.com.ph',
      location: 'Quezon City, Metro Manila',
      contactInfo: '+63 2 8922 6888',
      coverageArea: 'Luzon',
      categories: JSON.stringify(['gi_sheet', 'duct_accessory', 'duct_insulation']),
    },
  });

  console.log('  ✓ Suppliers created');

  // ── Materials ──────────────────────────────────────────────────────────

  const materialsData = [
    { category: 'refrigerant_pipe', name: '1/4" Copper Tube (Type L)', specification: 'ASTM B280, soft temper, 15m coil', unit: 'meter', unitPricePHP: 185 },
    { category: 'refrigerant_pipe', name: '3/8" Copper Tube (Type L)', specification: 'ASTM B280, soft temper, 15m coil', unit: 'meter', unitPricePHP: 275 },
    { category: 'refrigerant_pipe', name: '1/2" Copper Tube (Type L)', specification: 'ASTM B280, soft temper, 15m coil', unit: 'meter', unitPricePHP: 385 },
    { category: 'refrigerant_pipe', name: '5/8" Copper Tube (Type L)', specification: 'ASTM B280, soft temper, 15m coil', unit: 'meter', unitPricePHP: 485 },
    { category: 'refrigerant_pipe', name: '3/4" Copper Tube (Type L)', specification: 'ASTM B280, soft temper, 15m coil', unit: 'meter', unitPricePHP: 620 },
    { category: 'pipe_insulation', name: 'Armaflex 1/4" x 3/8"', specification: 'Closed-cell elastomeric, 9.5mm wall', unit: 'meter', unitPricePHP: 65 },
    { category: 'pipe_insulation', name: 'Armaflex 3/8" x 3/8"', specification: 'Closed-cell elastomeric, 9.5mm wall', unit: 'meter', unitPricePHP: 75 },
    { category: 'pipe_insulation', name: 'Armaflex 1/2" x 3/8"', specification: 'Closed-cell elastomeric, 9.5mm wall', unit: 'meter', unitPricePHP: 85 },
    { category: 'refrigerant', name: 'R32 Refrigerant (10kg)', specification: 'HFC, GWP=675, ISO 817', unit: 'tank', unitPricePHP: 4500 },
    { category: 'refrigerant', name: 'R410A Refrigerant (11.3kg)', specification: 'HFC blend, GWP=2088', unit: 'tank', unitPricePHP: 5200 },
    { category: 'gi_sheet', name: 'GI Sheet Gauge 24', specification: 'Galvanized iron, 4x8 ft, 0.56mm', unit: 'sheet', unitPricePHP: 850 },
    { category: 'gi_sheet', name: 'GI Sheet Gauge 22', specification: 'Galvanized iron, 4x8 ft, 0.70mm', unit: 'sheet', unitPricePHP: 1050 },
    { category: 'duct_insulation', name: 'PE Foam Insulation 25mm', specification: 'Cross-linked polyethylene, self-adhesive', unit: 'sqm', unitPricePHP: 320 },
    { category: 'duct_accessory', name: 'Supply Air Diffuser 12"x12"', specification: '4-way, powder-coated aluminum', unit: 'pc', unitPricePHP: 850 },
    { category: 'duct_accessory', name: 'Return Air Grille 18"x18"', specification: 'Egg-crate type, aluminum', unit: 'pc', unitPricePHP: 650 },
    { category: 'duct_accessory', name: 'Volume Damper 10"x10"', specification: 'Opposed blade, manual', unit: 'pc', unitPricePHP: 450 },
    { category: 'duct_accessory', name: 'Flexible Duct 10" dia', specification: 'Insulated, 6m length', unit: 'pc', unitPricePHP: 1200 },
    { category: 'pvc_pipe', name: 'PVC Pipe 3/4" Sch40', specification: 'ASTM D1785, 3m length', unit: 'pc', unitPricePHP: 165 },
    { category: 'pvc_pipe', name: 'PVC Pipe 1" Sch40', specification: 'ASTM D1785, 3m length', unit: 'pc', unitPricePHP: 215 },
    { category: 'electrical_wire', name: 'THHN Wire 3.5mm²', specification: '14 AWG, 150m roll, stranded copper', unit: 'roll', unitPricePHP: 4800 },
    { category: 'electrical_wire', name: 'THHN Wire 5.5mm²', specification: '10 AWG, 150m roll, stranded copper', unit: 'roll', unitPricePHP: 7200 },
    { category: 'electrical_wire', name: 'THHN Wire 8.0mm²', specification: '8 AWG, 75m roll, stranded copper', unit: 'roll', unitPricePHP: 8500 },
    { category: 'electrical_breaker', name: 'Circuit Breaker 20A', specification: '2-pole, 220V, bolt-on type', unit: 'pc', unitPricePHP: 850 },
    { category: 'electrical_breaker', name: 'Circuit Breaker 30A', specification: '2-pole, 220V, bolt-on type', unit: 'pc', unitPricePHP: 950 },
    { category: 'electrical_breaker', name: 'Circuit Breaker 50A', specification: '3-pole, 380V, bolt-on type', unit: 'pc', unitPricePHP: 2200 },
    { category: 'hanger_support', name: 'All-thread Rod 3/8"x10ft', specification: 'Galvanized steel', unit: 'pc', unitPricePHP: 120 },
    { category: 'hanger_support', name: 'C-clamp 3/8"', specification: 'Galvanized steel beam clamp', unit: 'pc', unitPricePHP: 45 },
    { category: 'brazing', name: 'Silver Brazing Rod', specification: '15% silver, 1.6mm × 500mm', unit: 'kg', unitPricePHP: 3800 },
    { category: 'controls', name: 'Digital Thermostat', specification: 'Programmable, 24V, 7-day schedule', unit: 'pc', unitPricePHP: 2500 },
    { category: 'misc', name: 'Refrigerant Flare Nut 1/4"', specification: 'Brass, SAE 45°', unit: 'pc', unitPricePHP: 35 },
  ];

  for (const mat of materialsData) {
    await prisma.material.create({
      data: {
        ...mat,
        supplierId: supplier1.id,
      },
    });
  }

  console.log('  ✓ Materials created (30 items)');

  // ── Equipment ─────────────────────────────────────────────────────────

  const equipmentData = [
    {
      manufacturer: 'Daikin', model: 'FTKF25BVM', type: 'wall_split',
      capacityTR: 0.75, capacityBTU: 9000, capacityKW: 2.5,
      powerInputKW: 0.69, currentAmps: 3.5, phase: '1-phase', voltage: 220,
      refrigerant: 'R32', eer: 12.5, cop: 3.62,
      liquidPipeSize: '1/4', gasPipeSize: '3/8', maxPipeLength: 15, maxElevation: 10,
      unitPricePHP: 32000,
    },
    {
      manufacturer: 'Daikin', model: 'FTKF35BVM', type: 'wall_split',
      capacityTR: 1.0, capacityBTU: 12000, capacityKW: 3.5,
      powerInputKW: 0.97, currentAmps: 4.8, phase: '1-phase', voltage: 220,
      refrigerant: 'R32', eer: 12.4, cop: 3.61,
      liquidPipeSize: '1/4', gasPipeSize: '3/8', maxPipeLength: 15, maxElevation: 10,
      unitPricePHP: 38000,
    },
    {
      manufacturer: 'Daikin', model: 'FTKF50BVM', type: 'wall_split',
      capacityTR: 1.5, capacityBTU: 18000, capacityKW: 5.0,
      powerInputKW: 1.45, currentAmps: 7.2, phase: '1-phase', voltage: 220,
      refrigerant: 'R32', eer: 12.0, cop: 3.45,
      liquidPipeSize: '1/4', gasPipeSize: '1/2', maxPipeLength: 20, maxElevation: 12,
      unitPricePHP: 48000,
    },
    {
      manufacturer: 'Daikin', model: 'FTKF71BVM', type: 'wall_split',
      capacityTR: 2.0, capacityBTU: 24000, capacityKW: 7.1,
      powerInputKW: 2.10, currentAmps: 10.5, phase: '1-phase', voltage: 220,
      refrigerant: 'R32', eer: 11.5, cop: 3.38,
      liquidPipeSize: '3/8', gasPipeSize: '5/8', maxPipeLength: 20, maxElevation: 12,
      unitPricePHP: 58000,
    },
    {
      manufacturer: 'Carrier', model: 'FP-42CGFR009', type: 'wall_split',
      capacityTR: 0.75, capacityBTU: 9000, capacityKW: 2.64,
      powerInputKW: 0.75, currentAmps: 3.8, phase: '1-phase', voltage: 220,
      refrigerant: 'R32', eer: 12.0, cop: 3.52,
      liquidPipeSize: '1/4', gasPipeSize: '3/8', maxPipeLength: 15, maxElevation: 10,
      unitPricePHP: 30000,
    },
    {
      manufacturer: 'Carrier', model: 'FP-42CGFR012', type: 'wall_split',
      capacityTR: 1.0, capacityBTU: 12000, capacityKW: 3.52,
      powerInputKW: 1.00, currentAmps: 5.0, phase: '1-phase', voltage: 220,
      refrigerant: 'R32', eer: 12.0, cop: 3.52,
      liquidPipeSize: '1/4', gasPipeSize: '3/8', maxPipeLength: 15, maxElevation: 10,
      unitPricePHP: 35000,
    },
    {
      manufacturer: 'Panasonic', model: 'CS/CU-KS9WKJ', type: 'wall_split',
      capacityTR: 0.75, capacityBTU: 9000, capacityKW: 2.5,
      powerInputKW: 0.66, currentAmps: 3.3, phase: '1-phase', voltage: 220,
      refrigerant: 'R32', eer: 13.6, cop: 3.79,
      liquidPipeSize: '1/4', gasPipeSize: '3/8', maxPipeLength: 15, maxElevation: 10,
      unitPricePHP: 29000,
    },
    {
      manufacturer: 'Daikin', model: 'FCF50CVM', type: 'ceiling_cassette',
      capacityTR: 1.5, capacityBTU: 18000, capacityKW: 5.0,
      powerInputKW: 1.50, currentAmps: 7.5, phase: '1-phase', voltage: 220,
      refrigerant: 'R32', eer: 12.0, cop: 3.33,
      liquidPipeSize: '1/4', gasPipeSize: '1/2', maxPipeLength: 30, maxElevation: 15,
      unitPricePHP: 68000,
    },
    {
      manufacturer: 'Daikin', model: 'FCF71CVM', type: 'ceiling_cassette',
      capacityTR: 2.0, capacityBTU: 24000, capacityKW: 7.1,
      powerInputKW: 2.20, currentAmps: 11.0, phase: '1-phase', voltage: 220,
      refrigerant: 'R32', eer: 10.9, cop: 3.23,
      liquidPipeSize: '3/8', gasPipeSize: '5/8', maxPipeLength: 30, maxElevation: 15,
      unitPricePHP: 82000,
    },
    {
      manufacturer: 'Carrier', model: 'FP-42UI018', type: 'ducted_split',
      capacityTR: 1.5, capacityBTU: 18000, capacityKW: 5.28,
      powerInputKW: 1.65, currentAmps: 8.2, phase: '1-phase', voltage: 220,
      refrigerant: 'R410A', eer: 11.0, cop: 3.20,
      liquidPipeSize: '3/8', gasPipeSize: '5/8', maxPipeLength: 30, maxElevation: 15,
      unitPricePHP: 75000,
    },
    {
      manufacturer: 'Daikin', model: 'FXMQ125PAVE', type: 'ducted_split',
      capacityTR: 3.5, capacityBTU: 42000, capacityKW: 12.5,
      powerInputKW: 3.70, currentAmps: 10.0, phase: '3-phase', voltage: 380,
      refrigerant: 'R410A', eer: 11.3, cop: 3.38,
      liquidPipeSize: '3/8', gasPipeSize: '3/4', maxPipeLength: 50, maxElevation: 30,
      unitPricePHP: 145000,
    },
    {
      manufacturer: 'Daikin', model: 'FXVQ200NY1', type: 'floor_standing',
      capacityTR: 5.7, capacityBTU: 68000, capacityKW: 20.0,
      powerInputKW: 6.10, currentAmps: 10.5, phase: '3-phase', voltage: 380,
      refrigerant: 'R410A', eer: 11.1, cop: 3.28,
      liquidPipeSize: '1/2', gasPipeSize: '1-1/8', maxPipeLength: 50, maxElevation: 30,
      unitPricePHP: 185000,
    },
  ];

  for (const eq of equipmentData) {
    await prisma.equipment.create({
      data: {
        ...eq,
        indoorDimensions: '',
        outdoorDimensions: '',
        indoorWeight: 0,
        outdoorWeight: 0,
      },
    });
  }

  console.log('  ✓ Equipment created (12 units)');

  // ── Sample Project — "Emerald Tower Business Center" ───────────────

  const project = await prisma.project.create({
    data: {
      name: 'Emerald Tower Business Center',
      clientName: 'GreenEdge Development Corp.',
      location: 'Makati City',
      city: 'Makati City',
      buildingType: 'office',
      status: 'active',
      totalFloorArea: 720,
      floorsAboveGrade: 3,
      floorsBelowGrade: 0,
      outdoorDB: 35,
      outdoorWB: 28,
      outdoorRH: 65,
      indoorDB: 24,
      indoorRH: 50,
      safetyFactor: 1.1,
      diversityFactor: 0.85,
      notes: '3-storey commercial office building along Ayala Avenue, Makati City. Ground floor is reception + conference, 2nd floor is the main open-plan office, 3rd floor houses executive offices and the boardroom. Construction: reinforced concrete frame with curtain wall on the north facade.',
    },
  });

  console.log(`  ✓ Project created: ${project.name}`);

  // ── Floors, Rooms, Cooling Loads, Equipment Selection ─────────────

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
    /** Index into equipmentData stored above — we will look up by model */
    equipModel: string;
    equipQty: number;
  }

  const floorConfigs: {
    floorNumber: number;
    name: string;
    rooms: RoomConfig[];
  }[] = [
    {
      floorNumber: 1,
      name: 'Ground Floor',
      rooms: [
        { name: 'Main Lobby', spaceType: 'lobby', area: 85, occupantCount: 15, lightingDensity: 14, equipmentLoad: 5, windowArea: 14, windowOrientation: 'N', windowType: 'double_tinted_6mm', wallConstruction: 'curtain_wall', ceilingHeight: 4.0, equipModel: 'FCF71CVM', equipQty: 2 },
        { name: 'Reception', spaceType: 'office', area: 28, occupantCount: 3, lightingDensity: 15, equipmentLoad: 20, windowArea: 4, windowOrientation: 'N', windowType: 'single_tinted_6mm', wallConstruction: 'concrete_block_200mm', ceilingHeight: 3.0, equipModel: 'FTKF35BVM', equipQty: 1 },
        { name: 'Conference Room A', spaceType: 'conference', area: 42, occupantCount: 14, lightingDensity: 18, equipmentLoad: 15, windowArea: 6, windowOrientation: 'E', windowType: 'double_clear_6mm', wallConstruction: 'concrete_block_200mm', ceilingHeight: 3.0, equipModel: 'FCF50CVM', equipQty: 1 },
        { name: 'Conference Room B', spaceType: 'conference', area: 30, occupantCount: 10, lightingDensity: 18, equipmentLoad: 12, windowArea: 4, windowOrientation: 'W', windowType: 'double_clear_6mm', wallConstruction: 'concrete_block_200mm', ceilingHeight: 3.0, equipModel: 'FTKF71BVM', equipQty: 1 },
        { name: 'Guard Station', spaceType: 'office', area: 12, occupantCount: 2, lightingDensity: 10, equipmentLoad: 8, windowArea: 2, windowOrientation: 'N', windowType: 'single_clear_6mm', wallConstruction: 'concrete_block_150mm', ceilingHeight: 3.0, equipModel: 'FTKF25BVM', equipQty: 1 },
      ],
    },
    {
      floorNumber: 2,
      name: '2nd Floor — Operations',
      rooms: [
        { name: 'Open Plan Office', spaceType: 'office', area: 140, occupantCount: 25, lightingDensity: 16, equipmentLoad: 25, windowArea: 18, windowOrientation: 'N', windowType: 'double_tinted_6mm', wallConstruction: 'curtain_wall', ceilingHeight: 2.8, equipModel: 'FCF71CVM', equipQty: 3 },
        { name: 'Manager Office 1', spaceType: 'office', area: 22, occupantCount: 1, lightingDensity: 12, equipmentLoad: 18, windowArea: 4, windowOrientation: 'E', windowType: 'double_clear_6mm', wallConstruction: 'concrete_block_200mm', ceilingHeight: 2.8, equipModel: 'FTKF25BVM', equipQty: 1 },
        { name: 'Manager Office 2', spaceType: 'office', area: 22, occupantCount: 1, lightingDensity: 12, equipmentLoad: 18, windowArea: 4, windowOrientation: 'W', windowType: 'double_clear_6mm', wallConstruction: 'concrete_block_200mm', ceilingHeight: 2.8, equipModel: 'FTKF25BVM', equipQty: 1 },
        { name: 'Server / IT Room', spaceType: 'server_room', area: 18, occupantCount: 0, lightingDensity: 10, equipmentLoad: 450, windowArea: 0, windowOrientation: 'N', windowType: 'single_clear_6mm', wallConstruction: 'concrete_block_200mm', ceilingHeight: 2.8, equipModel: 'FTKF71BVM', equipQty: 2 },
        { name: 'Pantry / Break Room', spaceType: 'kitchen', area: 24, occupantCount: 6, lightingDensity: 12, equipmentLoad: 30, windowArea: 3, windowOrientation: 'S', windowType: 'single_clear_6mm', wallConstruction: 'concrete_block_150mm', ceilingHeight: 2.8, equipModel: 'FTKF35BVM', equipQty: 1 },
      ],
    },
    {
      floorNumber: 3,
      name: '3rd Floor — Executive',
      rooms: [
        { name: 'Executive Suite', spaceType: 'office', area: 65, occupantCount: 4, lightingDensity: 12, equipmentLoad: 15, windowArea: 12, windowOrientation: 'N', windowType: 'double_low_e', wallConstruction: 'curtain_wall', ceilingHeight: 3.0, hasRoofExposure: true, equipModel: 'FCF71CVM', equipQty: 1 },
        { name: 'VP Office', spaceType: 'office', area: 30, occupantCount: 2, lightingDensity: 12, equipmentLoad: 15, windowArea: 5, windowOrientation: 'E', windowType: 'double_tinted_6mm', wallConstruction: 'concrete_block_200mm', ceilingHeight: 3.0, hasRoofExposure: true, equipModel: 'FTKF50BVM', equipQty: 1 },
        { name: 'Board Room', spaceType: 'conference', area: 55, occupantCount: 18, lightingDensity: 18, equipmentLoad: 15, windowArea: 10, windowOrientation: 'W', windowType: 'double_low_e', wallConstruction: 'curtain_wall', ceilingHeight: 3.0, hasRoofExposure: true, equipModel: 'FCF71CVM', equipQty: 2 },
        { name: 'Finance Office', spaceType: 'office', area: 35, occupantCount: 5, lightingDensity: 15, equipmentLoad: 22, windowArea: 5, windowOrientation: 'S', windowType: 'double_clear_6mm', wallConstruction: 'concrete_block_200mm', ceilingHeight: 3.0, hasRoofExposure: true, equipModel: 'FTKF50BVM', equipQty: 1 },
        { name: 'CEO Lounge', spaceType: 'lobby', area: 20, occupantCount: 3, lightingDensity: 10, equipmentLoad: 8, windowArea: 6, windowOrientation: 'N', windowType: 'double_low_e', wallConstruction: 'curtain_wall', ceilingHeight: 3.0, hasRoofExposure: true, equipModel: 'FTKF35BVM', equipQty: 1 },
      ],
    },
  ];

  // Build a model→id lookup so we can reference equipment records
  const allEquipment = await prisma.equipment.findMany();
  const equipByModel: Record<string, string> = {};
  for (const eq of allEquipment) {
    equipByModel[eq.model] = eq.id;
  }

  let totalRooms = 0;

  for (const floorCfg of floorConfigs) {
    const floor = await prisma.floor.create({
      data: {
        projectId: project.id,
        floorNumber: floorCfg.floorNumber,
        name: floorCfg.name,
        ceilingHeight: floorCfg.rooms[0]?.ceilingHeight || 3.0,
      },
    });

    for (const roomCfg of floorCfg.rooms) {
      const room = await prisma.room.create({
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
      });

      // ── Cooling load calculation (simplified CLTD/CLF) ──
      const dt = 35 - 24; // outdoor - indoor
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

      await prisma.coolingLoad.create({
        data: {
          roomId: room.id,
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
          calculationMethod: 'CLTD_CLF',
          safetyFactor: 1.1,
          diversityFactor: 0.85,
        },
      });

      // ── Selected equipment for the room ──
      const eqId = equipByModel[roomCfg.equipModel];
      if (eqId) {
        await prisma.selectedEquipment.create({
          data: {
            roomId: room.id,
            equipmentId: eqId,
            quantity: roomCfg.equipQty,
          },
        });
      }

      totalRooms++;
    }

    console.log(`  ✓ Floor ${floorCfg.floorNumber} (${floorCfg.name}): ${floorCfg.rooms.length} rooms`);
  }

  console.log(`  ✓ ${totalRooms} rooms with cooling loads & equipment selections`);

  // ── BOQ Items ─────────────────────────────────────────────────────────

  // Build realistic BOQ from the equipment + materials we already seeded
  const boqItems: {
    section: string;
    category: string;
    description: string;
    specification: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
    notes: string;
  }[] = [
    // -- Equipment --
    { section: 'A', category: 'equipment', description: 'Daikin FCF71CVM Ceiling Cassette 2.0 TR', specification: 'R32, 24,000 BTU/h, EER 10.9', quantity: 8, unit: 'set', unitPrice: 82000, totalPrice: 656000, notes: 'Lobby, Open Office, Executive, Board Room' },
    { section: 'A', category: 'equipment', description: 'Daikin FCF50CVM Ceiling Cassette 1.5 TR', specification: 'R32, 18,000 BTU/h, EER 12.0', quantity: 1, unit: 'set', unitPrice: 68000, totalPrice: 68000, notes: 'Conference Room A' },
    { section: 'A', category: 'equipment', description: 'Daikin FTKF71BVM Wall Split 2.0 TR', specification: 'R32, 24,000 BTU/h, EER 11.5', quantity: 3, unit: 'set', unitPrice: 58000, totalPrice: 174000, notes: 'Conf B, Server Room' },
    { section: 'A', category: 'equipment', description: 'Daikin FTKF50BVM Wall Split 1.5 TR', specification: 'R32, 18,000 BTU/h, EER 12.0', quantity: 2, unit: 'set', unitPrice: 48000, totalPrice: 96000, notes: 'VP Office, Finance' },
    { section: 'A', category: 'equipment', description: 'Daikin FTKF35BVM Wall Split 1.0 TR', specification: 'R32, 12,000 BTU/h, EER 12.4', quantity: 3, unit: 'set', unitPrice: 38000, totalPrice: 114000, notes: 'Reception, Pantry, CEO Lounge' },
    { section: 'A', category: 'equipment', description: 'Daikin FTKF25BVM Wall Split 0.75 TR', specification: 'R32, 9,000 BTU/h, EER 12.5', quantity: 3, unit: 'set', unitPrice: 32000, totalPrice: 96000, notes: 'Guard Station, Mgr Offices' },
    // -- Refrigerant Piping --
    { section: 'B', category: 'material', description: '1/4" Copper Tube (Type L)', specification: 'ASTM B280, soft temper, 15 m coil', quantity: 120, unit: 'meter', unitPrice: 185, totalPrice: 22200, notes: 'Liquid lines' },
    { section: 'B', category: 'material', description: '3/8" Copper Tube (Type L)', specification: 'ASTM B280, soft temper, 15 m coil', quantity: 80, unit: 'meter', unitPrice: 275, totalPrice: 22000, notes: 'Gas lines (small units)' },
    { section: 'B', category: 'material', description: '1/2" Copper Tube (Type L)', specification: 'ASTM B280, soft temper, 15 m coil', quantity: 45, unit: 'meter', unitPrice: 385, totalPrice: 17325, notes: 'Gas lines (1.5 TR)' },
    { section: 'B', category: 'material', description: '5/8" Copper Tube (Type L)', specification: 'ASTM B280, soft temper, 15 m coil', quantity: 60, unit: 'meter', unitPrice: 485, totalPrice: 29100, notes: 'Gas lines (2.0 TR)' },
    { section: 'B', category: 'material', description: 'Armaflex 1/4" × 3/8" Insulation', specification: 'Closed-cell elastomeric, 9.5 mm wall', quantity: 120, unit: 'meter', unitPrice: 65, totalPrice: 7800, notes: 'Pipe insulation' },
    { section: 'B', category: 'material', description: 'Armaflex 3/8" × 3/8" Insulation', specification: 'Closed-cell elastomeric, 9.5 mm wall', quantity: 80, unit: 'meter', unitPrice: 75, totalPrice: 6000, notes: 'Pipe insulation' },
    { section: 'B', category: 'material', description: 'R32 Refrigerant (10 kg)', specification: 'HFC, GWP = 675, ISO 817', quantity: 4, unit: 'tank', unitPrice: 4500, totalPrice: 18000, notes: 'Charging' },
    { section: 'B', category: 'material', description: 'Silver Brazing Rod', specification: '15 % silver, 1.6 mm × 500 mm', quantity: 3, unit: 'kg', unitPrice: 3800, totalPrice: 11400, notes: 'Brazing' },
    // -- Ductwork & Accessories --
    { section: 'C', category: 'material', description: 'GI Sheet Gauge 24', specification: 'Galvanized iron, 4 × 8 ft, 0.56 mm', quantity: 35, unit: 'sheet', unitPrice: 850, totalPrice: 29750, notes: 'Supply/return ducts' },
    { section: 'C', category: 'material', description: 'GI Sheet Gauge 22', specification: 'Galvanized iron, 4 × 8 ft, 0.70 mm', quantity: 15, unit: 'sheet', unitPrice: 1050, totalPrice: 15750, notes: 'Main trunk ducts' },
    { section: 'C', category: 'material', description: 'PE Foam Insulation 25 mm', specification: 'Cross-linked polyethylene, self-adhesive', quantity: 90, unit: 'sqm', unitPrice: 320, totalPrice: 28800, notes: 'Duct insulation' },
    { section: 'C', category: 'material', description: 'Supply Air Diffuser 12"×12"', specification: '4-way, powder-coated aluminum', quantity: 30, unit: 'pc', unitPrice: 850, totalPrice: 25500, notes: '' },
    { section: 'C', category: 'material', description: 'Return Air Grille 18"×18"', specification: 'Egg-crate type, aluminum', quantity: 20, unit: 'pc', unitPrice: 650, totalPrice: 13000, notes: '' },
    { section: 'C', category: 'material', description: 'Volume Damper 10"×10"', specification: 'Opposed blade, manual', quantity: 20, unit: 'pc', unitPrice: 450, totalPrice: 9000, notes: '' },
    { section: 'C', category: 'material', description: 'Flexible Duct 10" dia', specification: 'Insulated, 6 m length', quantity: 25, unit: 'pc', unitPrice: 1200, totalPrice: 30000, notes: '' },
    // -- Drainage --
    { section: 'D', category: 'material', description: 'PVC Pipe 3/4" Sch 40', specification: 'ASTM D1785, 3 m length', quantity: 30, unit: 'pc', unitPrice: 165, totalPrice: 4950, notes: 'Condensate drain' },
    { section: 'D', category: 'material', description: 'PVC Pipe 1" Sch 40', specification: 'ASTM D1785, 3 m length', quantity: 10, unit: 'pc', unitPrice: 215, totalPrice: 2150, notes: 'Condensate header' },
    // -- Electrical --
    { section: 'E', category: 'material', description: 'THHN Wire 3.5 mm² (14 AWG)', specification: '150 m roll, stranded copper', quantity: 2, unit: 'roll', unitPrice: 4800, totalPrice: 9600, notes: '0.75–1.0 TR units' },
    { section: 'E', category: 'material', description: 'THHN Wire 5.5 mm² (10 AWG)', specification: '150 m roll, stranded copper', quantity: 2, unit: 'roll', unitPrice: 7200, totalPrice: 14400, notes: '1.5–2.0 TR units' },
    { section: 'E', category: 'material', description: 'Circuit Breaker 20 A', specification: '2-pole, 220 V, bolt-on', quantity: 8, unit: 'pc', unitPrice: 850, totalPrice: 6800, notes: '≤ 1.0 TR' },
    { section: 'E', category: 'material', description: 'Circuit Breaker 30 A', specification: '2-pole, 220 V, bolt-on', quantity: 12, unit: 'pc', unitPrice: 950, totalPrice: 11400, notes: '1.5–2.0 TR' },
    { section: 'E', category: 'material', description: 'Digital Thermostat', specification: 'Programmable, 24 V, 7-day schedule', quantity: 15, unit: 'pc', unitPrice: 2500, totalPrice: 37500, notes: '' },
    // -- Supports --
    { section: 'F', category: 'material', description: 'All-thread Rod 3/8" × 10 ft', specification: 'Galvanized steel', quantity: 40, unit: 'pc', unitPrice: 120, totalPrice: 4800, notes: 'Duct/pipe hangers' },
    { section: 'F', category: 'material', description: 'C-clamp 3/8"', specification: 'Galvanized steel beam clamp', quantity: 80, unit: 'pc', unitPrice: 45, totalPrice: 3600, notes: '' },
    // -- Labor --
    { section: 'G', category: 'labor', description: 'HVAC Installation Labor', specification: 'Equipment + piping + ductwork + controls', quantity: 1, unit: 'lot', unitPrice: 280000, totalPrice: 280000, notes: 'Based on ₱14,000/TR' },
    { section: 'G', category: 'labor', description: 'Electrical Wiring & Breaker Installation', specification: 'All HVAC circuit wiring', quantity: 1, unit: 'lot', unitPrice: 65000, totalPrice: 65000, notes: '' },
    { section: 'G', category: 'labor', description: 'Testing, Commissioning & Balancing', specification: 'System startup, temp & airflow verification', quantity: 1, unit: 'lot', unitPrice: 45000, totalPrice: 45000, notes: '' },
  ];

  for (const item of boqItems) {
    await prisma.bOQItem.create({
      data: {
        projectId: project.id,
        section: item.section,
        category: item.category,
        description: item.description,
        specification: item.specification,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        notes: item.notes,
      },
    });
  }

  console.log(`  ✓ BOQ created: ${boqItems.length} line items`);

  // ── Electrical Loads ──────────────────────────────────────────────────

  const elecLoads = [
    { equipmentName: 'Daikin FCF71CVM (×8)', powerKW: 17.6, currentAmps: 88, voltage: 220, phase: '1-phase', cableSize: '5.5 mm²', breakerRating: 30 },
    { equipmentName: 'Daikin FCF50CVM (×1)', powerKW: 1.5, currentAmps: 7.5, voltage: 220, phase: '1-phase', cableSize: '3.5 mm²', breakerRating: 20 },
    { equipmentName: 'Daikin FTKF71BVM (×3)', powerKW: 6.3, currentAmps: 31.5, voltage: 220, phase: '1-phase', cableSize: '5.5 mm²', breakerRating: 30 },
    { equipmentName: 'Daikin FTKF50BVM (×2)', powerKW: 2.9, currentAmps: 14.4, voltage: 220, phase: '1-phase', cableSize: '3.5 mm²', breakerRating: 20 },
    { equipmentName: 'Daikin FTKF35BVM (×3)', powerKW: 2.91, currentAmps: 14.4, voltage: 220, phase: '1-phase', cableSize: '3.5 mm²', breakerRating: 20 },
    { equipmentName: 'Daikin FTKF25BVM (×3)', powerKW: 2.07, currentAmps: 10.5, voltage: 220, phase: '1-phase', cableSize: '3.5 mm²', breakerRating: 20 },
  ];

  for (const load of elecLoads) {
    await prisma.electricalLoad.create({
      data: { projectId: project.id, ...load },
    });
  }

  console.log(`  ✓ Electrical loads: ${elecLoads.length} entries`);

  // ── Audit Log ─────────────────────────────────────────────────────────

  await prisma.auditLog.create({
    data: {
      projectId: project.id,
      action: 'created',
      entity: 'project',
      entityId: project.id,
      details: JSON.stringify({ seeded: true, rooms: totalRooms }),
      notes: 'Seed: initial project data',
    },
  });

  await prisma.auditLog.create({
    data: {
      projectId: project.id,
      action: 'calculated',
      entity: 'coolingLoad',
      entityId: project.id,
      details: JSON.stringify({ method: 'CLTD_CLF', rooms: totalRooms }),
      notes: 'Seed: cooling loads computed for all rooms',
    },
  });

  await prisma.auditLog.create({
    data: {
      projectId: project.id,
      action: 'updated',
      entity: 'equipment',
      entityId: project.id,
      details: JSON.stringify({ selections: 20 }),
      notes: 'Seed: equipment auto-selected for all rooms',
    },
  });

  console.log('  ✓ Audit log entries created');
  console.log('');
  console.log('✅ Database seeded successfully!');
  console.log(`   Project : "${project.name}" (${project.id})`);
  console.log(`   Floors  : 3`);
  console.log(`   Rooms   : ${totalRooms}`);
  console.log(`   BOQ     : ${boqItems.length} line items`);
  console.log(`   Suppliers: 3 · Materials: 30 · Equipment catalog: 12`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
