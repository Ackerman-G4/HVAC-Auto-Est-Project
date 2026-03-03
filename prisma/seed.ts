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

  // ── Sample Project ────────────────────────────────────────────────────

  const project = await prisma.project.create({
    data: {
      name: 'Sample Office Tower',
      clientName: 'Acme Corporation',
      location: 'Manila',
      city: 'Manila',
      buildingType: 'office',
      status: 'active',
      totalFloorArea: 450,
      floorsAboveGrade: 3,
      floorsBelowGrade: 0,
      outdoorDB: 35,
      outdoorWB: 28,
      indoorDB: 24,
      indoorRH: 55,
      safetyFactor: 1.1,
      diversityFactor: 0.85,
      notes: 'Sample project for demonstration. 3-storey office building in Makati.',
    },
  });

  console.log(`  ✓ Project created: ${project.name}`);

  // ── Floors & Rooms ────────────────────────────────────────────────────

  const floorConfigs = [
    {
      floorNumber: 1, name: 'Ground Floor',
      rooms: [
        { name: 'Main Lobby', spaceType: 'lobby', area: 80, occupantCount: 15, lightingDensity: 12, equipmentLoad: 5, windowArea: 12, ceilingHeight: 4.0 },
        { name: 'Reception Office', spaceType: 'office', area: 25, occupantCount: 3, lightingDensity: 15, equipmentLoad: 20, windowArea: 4, ceilingHeight: 3.0 },
        { name: 'Conference Room A', spaceType: 'conference_room', area: 40, occupantCount: 12, lightingDensity: 18, equipmentLoad: 15, windowArea: 6, ceilingHeight: 3.0 },
      ],
    },
    {
      floorNumber: 2, name: '2nd Floor',
      rooms: [
        { name: 'Open Office', spaceType: 'office', area: 120, occupantCount: 20, lightingDensity: 15, equipmentLoad: 25, windowArea: 15, ceilingHeight: 2.8 },
        { name: 'Manager Office', spaceType: 'office', area: 20, occupantCount: 1, lightingDensity: 12, equipmentLoad: 15, windowArea: 3, ceilingHeight: 2.8 },
        { name: 'Server Room', spaceType: 'server_room', area: 15, occupantCount: 0, lightingDensity: 10, equipmentLoad: 400, windowArea: 0, ceilingHeight: 2.8 },
      ],
    },
    {
      floorNumber: 3, name: '3rd Floor',
      rooms: [
        { name: 'Executive Suite', spaceType: 'office', area: 60, occupantCount: 4, lightingDensity: 12, equipmentLoad: 15, windowArea: 10, ceilingHeight: 3.0, hasRoofExposure: true },
        { name: 'Board Room', spaceType: 'conference_room', area: 50, occupantCount: 16, lightingDensity: 18, equipmentLoad: 15, windowArea: 8, ceilingHeight: 3.0, hasRoofExposure: true },
        { name: 'Break Room', spaceType: 'kitchen', area: 20, occupantCount: 5, lightingDensity: 12, equipmentLoad: 30, windowArea: 2, ceilingHeight: 3.0, hasRoofExposure: true },
      ],
    },
  ];

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
          ceilingHeight: roomCfg.ceilingHeight,
          hasRoofExposure: (roomCfg as any).hasRoofExposure ?? false,
        },
      });

      // Calculate simplified cooling load for seed data
      const dt = 35 - 24; // outdoor - indoor
      const wallArea = Math.sqrt(roomCfg.area) * roomCfg.ceilingHeight * 2;
      
      const wallLoad = wallArea * 2.9 * 12;
      const roofLoad = (roomCfg as any).hasRoofExposure ? roomCfg.area * 1.8 * 25 : 0;
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
    }

    console.log(`  ✓ Floor ${floorCfg.floorNumber}: ${floorCfg.rooms.length} rooms with cooling loads`);
  }

  // ── Audit Log ─────────────────────────────────────────────────────────

  await prisma.auditLog.create({
    data: {
      projectId: project.id,
      action: 'created',
      entity: 'project',
      entityId: project.id,
      details: JSON.stringify({ seeded: true }),
      notes: 'Initial seed data',
    },
  });

  console.log('  ✓ Audit log entry created');
  console.log('');
  console.log('✅ Database seeded successfully!');
  console.log(`   Project: "${project.name}" (${project.id})`);
  console.log(`   Floors: 3, Rooms: 9, Suppliers: 3, Materials: 30, Equipment: 12`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
