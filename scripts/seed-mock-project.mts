/**
 * Seed a realistic 4-floor office building directly into Firestore
 * using the Firebase *client* SDK (no Admin SDK needed).
 *
 * Usage:
 *   npm run seed:mock
 *
 * Requires:
 *   - .env.local with NEXT_PUBLIC_FIREBASE_* config values
 *   - Firestore rules that allow writes (currently open)
 */

import dotenv from 'dotenv';
import process from 'node:process';
import { randomUUID } from 'node:crypto';

// Load .env then .env.local (later overrides earlier)
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

interface RoomDef {
  name: string;
  spaceType: string;
  area: number;
  ceilingHeight: number;
  occupantCount: number;
  lightingDensity: number;
  equipmentLoad: number;
  wallConstruction: string;
  windowArea: number;
  windowOrientation: string;
  windowType: string;
  hasRoofExposure?: boolean;
  notes?: string;
}

interface FloorDef {
  floorNumber: number;
  name: string;
  ceilingHeight: number;
  rooms: RoomDef[];
}

// ─── Test User ─────────────────────────────────────────────
const TEST_USER = {
  email: 'test@hvac-auto.dev',
  password: 'Test1234!',
  displayName: 'Test Engineer',
  role: 'admin' as const,
};

// ─── Mock Building Definition ──────────────────────────────
const PROJECT_INPUT = {
  name: 'Makati CBD Office Tower',
  clientName: 'Ayala Land Inc.',
  buildingType: 'office',
  location: 'Makati City, Metro Manila',
  city: 'Manila',
  totalFloorArea: 3200,
  floorsAboveGrade: 4,
  floorsBelowGrade: 0,
  outdoorDB: 35,
  outdoorWB: 28.3,
  outdoorRH: 65,
  indoorDB: 24,
  indoorRH: 50,
  notes: 'Mock 4-floor CBD office building for development & testing.',
};

const FLOORS: FloorDef[] = [
  // ── Floor 1: Lobby + Reception ───────────────────────────
  {
    floorNumber: 1,
    name: 'Ground Floor — Lobby',
    ceilingHeight: 4.0,
    rooms: [
      {
        name: 'Main Lobby',
        spaceType: 'lobby',
        area: 180,
        ceilingHeight: 4.0,
        occupantCount: 25,
        lightingDensity: 18,
        equipmentLoad: 2000,
        wallConstruction: 'curtain_wall',
        windowArea: 40,
        windowOrientation: 'S',
        windowType: 'double_tinted',
        notes: 'Double-height entrance lobby with curtain wall.',
      },
      {
        name: 'Reception Office',
        spaceType: 'office',
        area: 35,
        ceilingHeight: 3.0,
        occupantCount: 4,
        lightingDensity: 14,
        equipmentLoad: 800,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 4,
        windowOrientation: 'E',
        windowType: 'single_clear_6mm',
      },
      {
        name: 'Security Room',
        spaceType: 'utility',
        area: 18,
        ceilingHeight: 3.0,
        occupantCount: 2,
        lightingDensity: 12,
        equipmentLoad: 1500,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        notes: 'CCTV monitoring, no windows.',
      },
      {
        name: 'Ground Floor Restrooms',
        spaceType: 'restroom',
        area: 30,
        ceilingHeight: 3.0,
        occupantCount: 0,
        lightingDensity: 10,
        equipmentLoad: 400,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 2,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
      },
      {
        name: 'Retail Space',
        spaceType: 'retail',
        area: 65,
        ceilingHeight: 3.5,
        occupantCount: 15,
        lightingDensity: 22,
        equipmentLoad: 3000,
        wallConstruction: 'curtain_wall',
        windowArea: 14,
        windowOrientation: 'SW',
        windowType: 'double_tinted',
        notes: 'Street-facing retail unit.',
      },
    ],
  },

  // ── Floor 2: Open-Plan Offices ───────────────────────────
  {
    floorNumber: 2,
    name: '2nd Floor — Open Office',
    ceilingHeight: 2.85,
    rooms: [
      {
        name: 'Open Plan Office A',
        spaceType: 'open_office',
        area: 220,
        ceilingHeight: 2.85,
        occupantCount: 40,
        lightingDensity: 16,
        equipmentLoad: 8000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 25,
        windowOrientation: 'SE',
        windowType: 'double_low_e',
        notes: 'Primary workspace zone.',
      },
      {
        name: 'Open Plan Office B',
        spaceType: 'open_office',
        area: 180,
        ceilingHeight: 2.85,
        occupantCount: 32,
        lightingDensity: 16,
        equipmentLoad: 6400,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 20,
        windowOrientation: 'NW',
        windowType: 'double_low_e',
      },
      {
        name: 'Conference Room 2A',
        spaceType: 'conference',
        area: 45,
        ceilingHeight: 2.85,
        occupantCount: 16,
        lightingDensity: 14,
        equipmentLoad: 1200,
        wallConstruction: 'gypsum_partition',
        windowArea: 6,
        windowOrientation: 'E',
        windowType: 'double_tinted',
      },
      {
        name: 'Conference Room 2B',
        spaceType: 'conference',
        area: 30,
        ceilingHeight: 2.85,
        occupantCount: 10,
        lightingDensity: 14,
        equipmentLoad: 800,
        wallConstruction: 'gypsum_partition',
        windowArea: 4,
        windowOrientation: 'W',
        windowType: 'double_tinted',
      },
      {
        name: 'Pantry / Break Room',
        spaceType: 'kitchen',
        area: 28,
        ceilingHeight: 2.85,
        occupantCount: 6,
        lightingDensity: 12,
        equipmentLoad: 3500,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 3,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        notes: 'Microwave, fridge, coffee machine, water dispenser.',
      },
      {
        name: '2nd Floor Restrooms',
        spaceType: 'restroom',
        area: 24,
        ceilingHeight: 2.85,
        occupantCount: 0,
        lightingDensity: 10,
        equipmentLoad: 400,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 1.5,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
      },
    ],
  },

  // ── Floor 3: Executive + Meeting ─────────────────────────
  {
    floorNumber: 3,
    name: '3rd Floor — Executive',
    ceilingHeight: 2.85,
    rooms: [
      {
        name: 'Executive Office — CEO',
        spaceType: 'private_office',
        area: 55,
        ceilingHeight: 2.85,
        occupantCount: 2,
        lightingDensity: 14,
        equipmentLoad: 1200,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 10,
        windowOrientation: 'SE',
        windowType: 'double_low_e',
        notes: 'Corner office, panoramic windows.',
      },
      {
        name: 'Executive Office — CFO',
        spaceType: 'private_office',
        area: 40,
        ceilingHeight: 2.85,
        occupantCount: 2,
        lightingDensity: 14,
        equipmentLoad: 1000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 8,
        windowOrientation: 'S',
        windowType: 'double_low_e',
      },
      {
        name: 'Executive Office — COO',
        spaceType: 'private_office',
        area: 40,
        ceilingHeight: 2.85,
        occupantCount: 2,
        lightingDensity: 14,
        equipmentLoad: 1000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 8,
        windowOrientation: 'E',
        windowType: 'double_low_e',
      },
      {
        name: 'Boardroom',
        spaceType: 'conference',
        area: 75,
        ceilingHeight: 2.85,
        occupantCount: 24,
        lightingDensity: 16,
        equipmentLoad: 2500,
        wallConstruction: 'gypsum_partition',
        windowArea: 12,
        windowOrientation: 'SW',
        windowType: 'double_tinted',
        notes: 'Video-conferencing, 24-seat table.',
      },
      {
        name: 'Executive Lounge',
        spaceType: 'lobby',
        area: 50,
        ceilingHeight: 2.85,
        occupantCount: 8,
        lightingDensity: 12,
        equipmentLoad: 1500,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 6,
        windowOrientation: 'NW',
        windowType: 'double_tinted',
      },
      {
        name: 'EA / Admin Workspace',
        spaceType: 'office',
        area: 60,
        ceilingHeight: 2.85,
        occupantCount: 8,
        lightingDensity: 14,
        equipmentLoad: 2000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 8,
        windowOrientation: 'N',
        windowType: 'double_low_e',
      },
      {
        name: '3rd Floor Restrooms',
        spaceType: 'restroom',
        area: 24,
        ceilingHeight: 2.85,
        occupantCount: 0,
        lightingDensity: 10,
        equipmentLoad: 400,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 1.5,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
      },
    ],
  },

  // ── Floor 4: Server Room + Training ──────────────────────
  {
    floorNumber: 4,
    name: '4th Floor — IT & Training',
    ceilingHeight: 3.0,
    rooms: [
      {
        name: 'Server Room / Data Center',
        spaceType: 'server_room',
        area: 60,
        ceilingHeight: 3.0,
        occupantCount: 2,
        lightingDensity: 10,
        equipmentLoad: 25000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        notes: 'High heat load — racks, UPS, network gear. No windows.',
      },
      {
        name: 'Training Room A',
        spaceType: 'classroom',
        area: 80,
        ceilingHeight: 3.0,
        occupantCount: 30,
        lightingDensity: 16,
        equipmentLoad: 3000,
        wallConstruction: 'gypsum_partition',
        windowArea: 10,
        windowOrientation: 'SE',
        windowType: 'double_tinted',
        notes: 'Projector + 30 desks.',
      },
      {
        name: 'Training Room B',
        spaceType: 'classroom',
        area: 50,
        ceilingHeight: 3.0,
        occupantCount: 20,
        lightingDensity: 16,
        equipmentLoad: 2000,
        wallConstruction: 'gypsum_partition',
        windowArea: 6,
        windowOrientation: 'SW',
        windowType: 'double_tinted',
      },
      {
        name: 'IT Support Office',
        spaceType: 'office',
        area: 40,
        ceilingHeight: 3.0,
        occupantCount: 6,
        lightingDensity: 14,
        equipmentLoad: 3000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 5,
        windowOrientation: 'W',
        windowType: 'double_low_e',
      },
      {
        name: 'Storage / Archive',
        spaceType: 'storage',
        area: 25,
        ceilingHeight: 3.0,
        occupantCount: 0,
        lightingDensity: 8,
        equipmentLoad: 200,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
      },
      {
        name: '4th Floor Restrooms',
        spaceType: 'restroom',
        area: 24,
        ceilingHeight: 3.0,
        occupantCount: 0,
        lightingDensity: 10,
        equipmentLoad: 400,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 1.5,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
      },
      {
        name: 'Roof Mechanical Room',
        spaceType: 'mechanical',
        area: 35,
        ceilingHeight: 3.0,
        occupantCount: 0,
        lightingDensity: 8,
        equipmentLoad: 5000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 2,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        hasRoofExposure: true,
        notes: 'AHU, chiller controls, roof-exposed.',
      },
    ],
  },
];

// ─── Firebase Client Init ──────────────────────────────────
function initFirebase(): FirebaseApp {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !authDomain || !projectId) {
    throw new Error('Missing NEXT_PUBLIC_FIREBASE_* env vars in .env.local');
  }
  return initializeApp({ apiKey, authDomain, projectId });
}

function nowIso(): string {
  return new Date().toISOString();
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  const app = initFirebase();
  const auth = getAuth(app);
  const db = getFirestore(app);

  // ── 1. Create / sign-in test user ──────────────────────
  console.log(`Setting up test user: ${TEST_USER.email}`);
  try {
    const cred = await createUserWithEmailAndPassword(auth, TEST_USER.email, TEST_USER.password);
    await updateProfile(cred.user, { displayName: TEST_USER.displayName });
    console.log('  → User created.\n');
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code === 'auth/email-already-in-use') {
      console.log('  → User already exists, signing in.\n');
      await signInWithEmailAndPassword(auth, TEST_USER.email, TEST_USER.password);
    } else {
      throw err;
    }
  }

  // ── 2. Create project document ─────────────────────────
  const projectId = randomUUID();
  const now = nowIso();
  console.log(`Creating project: ${PROJECT_INPUT.name}`);

  await setDoc(doc(db, 'projects', projectId), {
    id: projectId,
    name: PROJECT_INPUT.name,
    clientName: PROJECT_INPUT.clientName,
    location: PROJECT_INPUT.location,
    city: PROJECT_INPUT.city,
    buildingType: PROJECT_INPUT.buildingType,
    status: 'draft',
    outputClassification: 'preliminary',
    totalFloorArea: PROJECT_INPUT.totalFloorArea,
    floorsAboveGrade: PROJECT_INPUT.floorsAboveGrade,
    floorsBelowGrade: PROJECT_INPUT.floorsBelowGrade,
    outdoorDB: PROJECT_INPUT.outdoorDB,
    outdoorWB: PROJECT_INPUT.outdoorWB,
    outdoorRH: PROJECT_INPUT.outdoorRH,
    indoorDB: PROJECT_INPUT.indoorDB,
    indoorRH: PROJECT_INPUT.indoorRH,
    designConditions: '{}',
    safetyFactor: 1.1,
    diversityFactor: 0.85,
    notes: PROJECT_INPUT.notes,
    suggestedLaborMultiplier: 0.35,
    laborMultiplierOverride: null,
    suggestedOverheadPercent: 0.15,
    overheadPercentOverride: null,
    suggestedContingencyPercent: 0.05,
    contingencyPercentOverride: null,
    suggestedVatRate: 0.12,
    vatRateOverride: null,
    isEquipmentStale: false,
    isBoqStale: false,
    lastCoolingLoadAt: null,
    lastEquipmentSyncAt: null,
    lastBoqGeneratedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`  → ${projectId}\n`);

  // ── 3. Create floors + rooms ───────────────────────────
  let totalRooms = 0;
  for (const floorDef of FLOORS) {
    const floorId = randomUUID();
    const floorNow = nowIso();

    // Create floor document
    await setDoc(doc(db, 'floors', floorId), {
      id: floorId,
      projectId,
      floorNumber: floorDef.floorNumber,
      name: floorDef.name,
      floorPlanImage: null,
      scale: 50,
      ceilingHeight: floorDef.ceilingHeight,
      createdAt: floorNow,
      updatedAt: floorNow,
    });

    console.log(`Floor ${floorDef.floorNumber}: ${floorDef.name}`);

    for (const room of floorDef.rooms) {
      const roomId = randomUUID();
      const roomNow = nowIso();
      const perimeter = room.area > 0 ? Math.sqrt(room.area) * 4 : 0;

      await setDoc(doc(db, 'rooms', roomId), {
        id: roomId,
        projectId,
        floorId,
        name: room.name,
        polygon: '[]',
        area: room.area,
        perimeter: Math.round(perimeter * 100) / 100,
        spaceType: room.spaceType,
        occupantCount: room.occupantCount,
        lightingDensity: room.lightingDensity,
        equipmentLoad: room.equipmentLoad,
        wallConstruction: room.wallConstruction,
        windowArea: room.windowArea,
        windowOrientation: room.windowOrientation,
        windowType: room.windowType,
        ceilingHeight: room.ceilingHeight,
        hasRoofExposure: room.hasRoofExposure ?? false,
        notes: room.notes ?? '',
        coolingLoad: null,
        createdAt: roomNow,
        updatedAt: roomNow,
      });

      totalRooms++;
      console.log(`  + ${room.name} (${room.area} m²)`);
    }
  }

  console.log(`\n✓ Done — ${FLOORS.length} floors, ${totalRooms} rooms.`);
  console.log(`  Project ID : ${projectId}`);
  console.log(`  Test login : ${TEST_USER.email} / ${TEST_USER.password}`);
  console.log(`  Open the app and log in to view the project.`);

  // Force exit — Firebase client SDK keeps a persistent connection
  process.exit(0);
}

main().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
