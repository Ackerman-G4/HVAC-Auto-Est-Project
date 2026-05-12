/**
 * Seed a realistic multi-floor building via the app's REST API.
 * Works in both local mode and Firebase mode — no Firebase SDK needed.
 *
 * Usage:
 *   npm run seed:mock          (dev server must be running on localhost:3000)
 *
 * Env overrides:
 *   SEED_BASE_URL=http://localhost:3000   (change target host)
 *   SEED_PROFILE=medium|large|stress      (default: medium)
 *   SEED_PROJECT_COUNT=3                  (override profile default)
 *   SEED_MAX_FLOORS_PER_PROJECT=4         (0 or negative = all floors)
 *   SEED_MAX_ROOMS_PER_FLOOR=12           (0 or negative = all rooms)
 */

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

type SeedProfile = 'medium' | 'large' | 'stress';

interface SeedConfig {
  profile: SeedProfile;
  projectCount: number;
  maxFloorsPerProject: number;
  maxRoomsPerFloor: number;
}

interface SeededProjectSummary {
  id: string;
  name: string;
  floorCount: number;
  roomCount: number;
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
  name: 'BGC Mixed-Use Tower',
  clientName: 'Megaworld Corp.',
  buildingType: 'mixed',
  location: 'Bonifacio Global City, Taguig',
  city: 'Manila',
  totalFloorArea: 8400,
  floorsAboveGrade: 8,
  floorsBelowGrade: 1,
  outdoorDB: 35,
  outdoorWB: 28.3,
  outdoorRH: 65,
  indoorDB: 24,
  indoorRH: 50,
  notes: 'Mock 8-floor + basement mixed-use tower for full system testing.',
};

const FLOORS: FloorDef[] = [
  // ── Basement: Parking + Mechanical ───────────────────────
  {
    floorNumber: -1,
    name: 'Basement — Parking & MEP',
    ceilingHeight: 3.2,
    rooms: [
      {
        name: 'Parking Zone A',
        spaceType: 'parking',
        area: 400,
        ceilingHeight: 3.2,
        occupantCount: 0,
        lightingDensity: 6,
        equipmentLoad: 500,
        wallConstruction: 'concrete_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        notes: '80-slot parking, ventilation exhaust fans.',
      },
      {
        name: 'Chiller Plant Room',
        spaceType: 'mechanical',
        area: 120,
        ceilingHeight: 3.2,
        occupantCount: 0,
        lightingDensity: 10,
        equipmentLoad: 45000,
        wallConstruction: 'concrete_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        notes: '3x screw chillers, cooling towers on roof.',
      },
      {
        name: 'Electrical Room',
        spaceType: 'utility',
        area: 50,
        ceilingHeight: 3.2,
        occupantCount: 0,
        lightingDensity: 10,
        equipmentLoad: 8000,
        wallConstruction: 'concrete_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        notes: 'Main switchgear, transformers, UPS.',
      },
      {
        name: 'Fire Pump Room',
        spaceType: 'mechanical',
        area: 30,
        ceilingHeight: 3.2,
        occupantCount: 0,
        lightingDensity: 8,
        equipmentLoad: 3000,
        wallConstruction: 'concrete_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
      },
    ],
  },

  // ── Floor 1: Lobby + Retail ──────────────────────────────
  {
    floorNumber: 1,
    name: 'Ground Floor — Lobby & Retail',
    ceilingHeight: 4.5,
    rooms: [
      {
        name: 'Grand Lobby',
        spaceType: 'lobby',
        area: 250,
        ceilingHeight: 4.5,
        occupantCount: 40,
        lightingDensity: 22,
        equipmentLoad: 3000,
        wallConstruction: 'curtain_wall',
        windowArea: 60,
        windowOrientation: 'S',
        windowType: 'double_low_e',
        notes: 'Double-height entrance with curtain wall facade.',
      },
      {
        name: 'Retail Unit A — Café',
        spaceType: 'restaurant',
        area: 80,
        ceilingHeight: 3.5,
        occupantCount: 30,
        lightingDensity: 18,
        equipmentLoad: 6000,
        wallConstruction: 'curtain_wall',
        windowArea: 16,
        windowOrientation: 'SW',
        windowType: 'double_tinted',
        notes: 'Coffee shop with kitchen equipment.',
      },
      {
        name: 'Retail Unit B — Convenience Store',
        spaceType: 'retail',
        area: 60,
        ceilingHeight: 3.5,
        occupantCount: 15,
        lightingDensity: 22,
        equipmentLoad: 4500,
        wallConstruction: 'curtain_wall',
        windowArea: 12,
        windowOrientation: 'SE',
        windowType: 'double_tinted',
        notes: 'Refrigerated displays.',
      },
      {
        name: 'Reception & Security',
        spaceType: 'office',
        area: 35,
        ceilingHeight: 3.0,
        occupantCount: 4,
        lightingDensity: 14,
        equipmentLoad: 1200,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 2,
        windowOrientation: 'E',
        windowType: 'single_clear_6mm',
      },
      {
        name: 'GF Restrooms',
        spaceType: 'restroom',
        area: 35,
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
        name: 'Loading Dock',
        spaceType: 'warehouse',
        area: 50,
        ceilingHeight: 4.0,
        occupantCount: 2,
        lightingDensity: 8,
        equipmentLoad: 300,
        wallConstruction: 'concrete_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
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
        area: 280,
        ceilingHeight: 2.85,
        occupantCount: 55,
        lightingDensity: 16,
        equipmentLoad: 11000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 30,
        windowOrientation: 'SE',
        windowType: 'double_low_e',
        notes: 'Primary workspace — 55 workstations.',
      },
      {
        name: 'Open Plan Office B',
        spaceType: 'open_office',
        area: 200,
        ceilingHeight: 2.85,
        occupantCount: 38,
        lightingDensity: 16,
        equipmentLoad: 7600,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 22,
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
        name: 'Phone Booths (x4)',
        spaceType: 'private_office',
        area: 12,
        ceilingHeight: 2.85,
        occupantCount: 4,
        lightingDensity: 12,
        equipmentLoad: 400,
        wallConstruction: 'gypsum_partition',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
      },
      {
        name: 'Pantry / Break Room',
        spaceType: 'kitchen',
        area: 32,
        ceilingHeight: 2.85,
        occupantCount: 8,
        lightingDensity: 12,
        equipmentLoad: 3500,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 3,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        notes: 'Microwave, fridge, coffee machine.',
      },
      {
        name: '2F Restrooms',
        spaceType: 'restroom',
        area: 28,
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
        windowArea: 12,
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
        area: 80,
        ceilingHeight: 2.85,
        occupantCount: 24,
        lightingDensity: 16,
        equipmentLoad: 2500,
        wallConstruction: 'gypsum_partition',
        windowArea: 14,
        windowOrientation: 'SW',
        windowType: 'double_tinted',
        notes: 'Video conferencing, 24-seat table.',
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
        name: '3F Restrooms',
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

  // ── Floor 4: Training + Clinic ───────────────────────────
  {
    floorNumber: 4,
    name: '4th Floor — Training & Amenities',
    ceilingHeight: 3.0,
    rooms: [
      {
        name: 'Training Room A',
        spaceType: 'classroom',
        area: 90,
        ceilingHeight: 3.0,
        occupantCount: 35,
        lightingDensity: 16,
        equipmentLoad: 3500,
        wallConstruction: 'gypsum_partition',
        windowArea: 12,
        windowOrientation: 'SE',
        windowType: 'double_tinted',
        notes: 'Projector + 35 desks.',
      },
      {
        name: 'Training Room B',
        spaceType: 'classroom',
        area: 60,
        ceilingHeight: 3.0,
        occupantCount: 24,
        lightingDensity: 16,
        equipmentLoad: 2400,
        wallConstruction: 'gypsum_partition',
        windowArea: 8,
        windowOrientation: 'SW',
        windowType: 'double_tinted',
      },
      {
        name: 'Company Gym',
        spaceType: 'gym',
        area: 100,
        ceilingHeight: 3.0,
        occupantCount: 18,
        lightingDensity: 14,
        equipmentLoad: 4000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 10,
        windowOrientation: 'W',
        windowType: 'double_tinted',
        notes: 'Treadmills, weights, shower rooms adjacent.',
      },
      {
        name: 'Clinic / First Aid',
        spaceType: 'hospital_ward',
        area: 35,
        ceilingHeight: 3.0,
        occupantCount: 4,
        lightingDensity: 18,
        equipmentLoad: 1500,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 4,
        windowOrientation: 'E',
        windowType: 'double_low_e',
      },
      {
        name: 'Multi-Purpose Hall',
        spaceType: 'theater',
        area: 150,
        ceilingHeight: 3.0,
        occupantCount: 80,
        lightingDensity: 16,
        equipmentLoad: 5000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        notes: 'Town hall events, presentations. Blackout room.',
      },
      {
        name: '4F Restrooms',
        spaceType: 'restroom',
        area: 28,
        ceilingHeight: 3.0,
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

  // ── Floor 5: Hotel Rooms ─────────────────────────────────
  {
    floorNumber: 5,
    name: '5th Floor — Hotel Suites',
    ceilingHeight: 2.7,
    rooms: [
      {
        name: 'Suite 501',
        spaceType: 'hotel_room',
        area: 45,
        ceilingHeight: 2.7,
        occupantCount: 2,
        lightingDensity: 12,
        equipmentLoad: 800,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 8,
        windowOrientation: 'SE',
        windowType: 'double_low_e',
      },
      {
        name: 'Suite 502',
        spaceType: 'hotel_room',
        area: 45,
        ceilingHeight: 2.7,
        occupantCount: 2,
        lightingDensity: 12,
        equipmentLoad: 800,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 8,
        windowOrientation: 'S',
        windowType: 'double_low_e',
      },
      {
        name: 'Suite 503',
        spaceType: 'hotel_room',
        area: 55,
        ceilingHeight: 2.7,
        occupantCount: 3,
        lightingDensity: 12,
        equipmentLoad: 1000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 10,
        windowOrientation: 'SW',
        windowType: 'double_low_e',
        notes: 'Premium corner suite.',
      },
      {
        name: 'Suite 504',
        spaceType: 'hotel_room',
        area: 40,
        ceilingHeight: 2.7,
        occupantCount: 2,
        lightingDensity: 12,
        equipmentLoad: 800,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 6,
        windowOrientation: 'NW',
        windowType: 'double_low_e',
      },
      {
        name: 'Suite 505',
        spaceType: 'hotel_room',
        area: 40,
        ceilingHeight: 2.7,
        occupantCount: 2,
        lightingDensity: 12,
        equipmentLoad: 800,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 6,
        windowOrientation: 'N',
        windowType: 'double_low_e',
      },
      {
        name: '5F Corridor',
        spaceType: 'corridor',
        area: 45,
        ceilingHeight: 2.7,
        occupantCount: 0,
        lightingDensity: 8,
        equipmentLoad: 200,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 2,
        windowOrientation: 'E',
        windowType: 'single_clear_6mm',
      },
      {
        name: '5F Housekeeping',
        spaceType: 'storage',
        area: 15,
        ceilingHeight: 2.7,
        occupantCount: 1,
        lightingDensity: 10,
        equipmentLoad: 300,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
      },
    ],
  },

  // ── Floor 6: Residential ─────────────────────────────────
  {
    floorNumber: 6,
    name: '6th Floor — Residential Units',
    ceilingHeight: 2.7,
    rooms: [
      {
        name: 'Unit 601 — 2BR',
        spaceType: 'residential',
        area: 75,
        ceilingHeight: 2.7,
        occupantCount: 4,
        lightingDensity: 10,
        equipmentLoad: 1800,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 12,
        windowOrientation: 'SE',
        windowType: 'double_low_e',
      },
      {
        name: 'Unit 602 — 1BR',
        spaceType: 'residential',
        area: 50,
        ceilingHeight: 2.7,
        occupantCount: 2,
        lightingDensity: 10,
        equipmentLoad: 1200,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 8,
        windowOrientation: 'S',
        windowType: 'double_low_e',
      },
      {
        name: 'Unit 603 — Studio',
        spaceType: 'residential',
        area: 32,
        ceilingHeight: 2.7,
        occupantCount: 1,
        lightingDensity: 10,
        equipmentLoad: 800,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 5,
        windowOrientation: 'W',
        windowType: 'double_low_e',
      },
      {
        name: 'Unit 604 — 3BR Penthouse',
        spaceType: 'residential',
        area: 120,
        ceilingHeight: 2.7,
        occupantCount: 5,
        lightingDensity: 12,
        equipmentLoad: 2800,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 20,
        windowOrientation: 'NW',
        windowType: 'double_low_e',
        notes: 'Premium unit with balcony.',
      },
      {
        name: '6F Corridor',
        spaceType: 'corridor',
        area: 30,
        ceilingHeight: 2.7,
        occupantCount: 0,
        lightingDensity: 8,
        equipmentLoad: 200,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 2,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
      },
    ],
  },

  // ── Floor 7: Data Center + IT ────────────────────────────
  {
    floorNumber: 7,
    name: '7th Floor — Data Center & IT',
    ceilingHeight: 3.0,
    rooms: [
      {
        name: 'Primary Data Center',
        spaceType: 'server_room',
        area: 100,
        ceilingHeight: 3.0,
        occupantCount: 3,
        lightingDensity: 10,
        equipmentLoad: 60000,
        wallConstruction: 'concrete_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        notes: 'Main DC — raised floor, hot/cold aisle, UPS-backed.',
      },
      {
        name: 'Secondary Server Closet',
        spaceType: 'server_room',
        area: 25,
        ceilingHeight: 3.0,
        occupantCount: 1,
        lightingDensity: 10,
        equipmentLoad: 8000,
        wallConstruction: 'concrete_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        notes: 'Network closet — switches, patch panels.',
      },
      {
        name: 'UPS / Battery Room',
        spaceType: 'utility',
        area: 30,
        ceilingHeight: 3.0,
        occupantCount: 0,
        lightingDensity: 10,
        equipmentLoad: 5000,
        wallConstruction: 'concrete_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
      },
      {
        name: 'IT Workshop',
        spaceType: 'office',
        area: 45,
        ceilingHeight: 3.0,
        occupantCount: 6,
        lightingDensity: 14,
        equipmentLoad: 3500,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 6,
        windowOrientation: 'W',
        windowType: 'double_low_e',
      },
      {
        name: 'NOC — Network Operations Center',
        spaceType: 'office',
        area: 55,
        ceilingHeight: 3.0,
        occupantCount: 8,
        lightingDensity: 16,
        equipmentLoad: 6000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 4,
        windowOrientation: 'E',
        windowType: 'double_tinted',
        notes: 'Video-wall monitors, 24/7 ops.',
      },
      {
        name: '7F Restrooms',
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
    ],
  },

  // ── Floor 8: Roof Mechanical + Amenity ───────────────────
  {
    floorNumber: 8,
    name: '8th Floor — Roof Deck & Mechanical',
    ceilingHeight: 3.5,
    rooms: [
      {
        name: 'Roof Mechanical Room',
        spaceType: 'mechanical',
        area: 60,
        ceilingHeight: 3.5,
        occupantCount: 0,
        lightingDensity: 8,
        equipmentLoad: 15000,
        wallConstruction: 'concrete_200mm',
        windowArea: 4,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        hasRoofExposure: true,
        notes: 'AHU, cooling towers, exhaust fans. Full roof exposure.',
      },
      {
        name: 'Elevator Machine Room',
        spaceType: 'mechanical',
        area: 25,
        ceilingHeight: 3.5,
        occupantCount: 0,
        lightingDensity: 8,
        equipmentLoad: 8000,
        wallConstruction: 'concrete_200mm',
        windowArea: 0,
        windowOrientation: 'N',
        windowType: 'single_clear_6mm',
        hasRoofExposure: true,
      },
      {
        name: 'Roof Deck Lounge',
        spaceType: 'lobby',
        area: 100,
        ceilingHeight: 3.5,
        occupantCount: 20,
        lightingDensity: 14,
        equipmentLoad: 2000,
        wallConstruction: 'curtain_wall',
        windowArea: 30,
        windowOrientation: 'S',
        windowType: 'double_low_e',
        hasRoofExposure: true,
        notes: 'Open-air amenity deck with partial canopy.',
      },
      {
        name: 'Sky Bar Kitchen',
        spaceType: 'kitchen',
        area: 35,
        ceilingHeight: 3.0,
        occupantCount: 5,
        lightingDensity: 16,
        equipmentLoad: 8000,
        wallConstruction: 'concrete_block_200mm',
        windowArea: 3,
        windowOrientation: 'W',
        windowType: 'single_tinted_6mm',
        hasRoofExposure: true,
        notes: 'Commercial kitchen — hood exhaust, gas range.',
      },
    ],
  },
];

// ─── API Helpers ───────────────────────────────────────────
const BASE_URL = process.env.SEED_BASE_URL || 'http://localhost:3000';

const PROFILE_DEFAULTS: Record<SeedProfile, Omit<SeedConfig, 'profile'>> = {
  medium: {
    projectCount: 3,
    maxFloorsPerProject: 4,
    maxRoomsPerFloor: 10,
  },
  large: {
    projectCount: 5,
    maxFloorsPerProject: 0,
    maxRoomsPerFloor: 0,
  },
  stress: {
    projectCount: 10,
    maxFloorsPerProject: 0,
    maxRoomsPerFloor: 0,
  },
};

function parseIntEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) {
    return undefined;
  }

  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : undefined;
}

function resolveSeedProfile(raw: string | undefined): SeedProfile {
  const normalized = (raw || '').trim().toLowerCase();
  if (normalized === 'large' || normalized === 'stress') {
    return normalized;
  }
  return 'medium';
}

function resolveSeedConfig(): SeedConfig {
  const profile = resolveSeedProfile(process.env.SEED_PROFILE);
  const defaults = PROFILE_DEFAULTS[profile];

  const projectCountOverride = parseIntEnv('SEED_PROJECT_COUNT');
  const maxFloorsOverride = parseIntEnv('SEED_MAX_FLOORS_PER_PROJECT');
  const maxRoomsOverride = parseIntEnv('SEED_MAX_ROOMS_PER_FLOOR');

  return {
    profile,
    projectCount:
      projectCountOverride && projectCountOverride > 0
        ? projectCountOverride
        : defaults.projectCount,
    maxFloorsPerProject:
      maxFloorsOverride !== undefined ? maxFloorsOverride : defaults.maxFloorsPerProject,
    maxRoomsPerFloor:
      maxRoomsOverride !== undefined ? maxRoomsOverride : defaults.maxRoomsPerFloor,
  };
}

function selectFloors(config: SeedConfig): FloorDef[] {
  const floorLimit = config.maxFloorsPerProject;
  const candidateFloors = floorLimit > 0 ? FLOORS.slice(0, floorLimit) : FLOORS;

  return candidateFloors.map((floor) => {
    const roomLimit = config.maxRoomsPerFloor;
    const selectedRooms = roomLimit > 0 ? floor.rooms.slice(0, roomLimit) : floor.rooms;

    return {
      ...floor,
      rooms: selectedRooms.map((room) => ({ ...room })),
    };
  });
}

function buildProjectPayload(projectIndex: number, config: SeedConfig, floors: FloorDef[]) {
  const displayIndex = String(projectIndex + 1).padStart(2, '0');
  const floorArea = floors.reduce(
    (projectTotal, floor) => projectTotal + floor.rooms.reduce((sum, room) => sum + room.area, 0),
    0,
  );

  const floorsAboveGrade = floors.filter((floor) => floor.floorNumber > 0).length;
  const floorsBelowGrade = floors.filter((floor) => floor.floorNumber <= 0).length;
  const outdoorOffset = (projectIndex % 3) * 0.5;

  return {
    name: `${PROJECT_INPUT.name} [QA ${displayIndex}]`,
    clientName: PROJECT_INPUT.clientName,
    buildingType: PROJECT_INPUT.buildingType,
    location: PROJECT_INPUT.location,
    city: PROJECT_INPUT.city,
    totalFloorArea: Math.round(floorArea),
    floorsAboveGrade,
    floorsBelowGrade,
    outdoorDB: PROJECT_INPUT.outdoorDB + outdoorOffset,
    outdoorWB: PROJECT_INPUT.outdoorWB + outdoorOffset,
    outdoorRH: PROJECT_INPUT.outdoorRH,
    indoorDB: PROJECT_INPUT.indoorDB,
    indoorRH: PROJECT_INPUT.indoorRH,
    notes: `${PROJECT_INPUT.notes} Seed profile: ${config.profile}, project ${projectIndex + 1}/${config.projectCount}.`,
  };
}

function buildRoomPayload(floorDef: FloorDef, room: RoomDef) {
  return {
    name: room.name,
    floorNumber: floorDef.floorNumber,
    floorName: floorDef.name,
    spaceType: room.spaceType,
    area: room.area,
    perimeter: room.area > 0 ? Math.round(Math.sqrt(room.area) * 4 * 100) / 100 : 0,
    ceilingHeight: room.ceilingHeight,
    wallConstruction: room.wallConstruction,
    windowType: room.windowType,
    windowArea: room.windowArea,
    windowOrientation: room.windowOrientation,
    occupantCount: room.occupantCount,
    lightingDensity: room.lightingDensity,
    equipmentLoad: room.equipmentLoad,
    hasRoofExposure: room.hasRoofExposure ?? false,
    notes: room.notes ?? '',
  };
}

async function apiPost(path: string, body: unknown, token?: string): Promise<unknown> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${path}: ${text}`);
  }
  return res.json();
}

// ─── Main ──────────────────────────────────────────────────
async function main() {
  const config = resolveSeedConfig();

  console.log(`Seed target: ${BASE_URL}`);
  console.log(
    `Seed config: profile=${config.profile}, projects=${config.projectCount}, maxFloors=${config.maxFloorsPerProject || 'all'}, maxRooms=${config.maxRoomsPerFloor || 'all'}`,
  );

  // 1. Register or login test user
  console.log(`Setting up test user: ${TEST_USER.email}`);
  let token: string;
  try {
    const regResult = (await apiPost('/api/auth/register', {
      email: TEST_USER.email,
      password: TEST_USER.password,
      name: TEST_USER.displayName,
      role: TEST_USER.role,
    })) as { token: string };
    token = regResult.token;
    console.log('  → User created.\n');
  } catch {
    const loginResult = (await apiPost('/api/auth/login', {
      email: TEST_USER.email,
      password: TEST_USER.password,
    })) as { token: string };
    token = loginResult.token;
    console.log('  → User already exists, logged in.\n');
  }

  // 2. Create projects, floors, and rooms
  let totalRooms = 0;
  let totalFloors = 0;
  const seededProjects: SeededProjectSummary[] = [];

  for (let projectIndex = 0; projectIndex < config.projectCount; projectIndex += 1) {
    const floorsForProject = selectFloors(config);
    const projectPayload = buildProjectPayload(projectIndex, config, floorsForProject);

    console.log(`\nCreating project ${projectIndex + 1}/${config.projectCount}: ${projectPayload.name}`);
    const projResult = (await apiPost('/api/projects', projectPayload, token)) as {
      project: { id: string };
    };

    const projectId = projResult.project.id;
    console.log(`  → ${projectId}`);

    let roomsInProject = 0;
    for (const floorDef of floorsForProject) {
      console.log(`  Floor ${floorDef.floorNumber}: ${floorDef.name}`);

      for (const room of floorDef.rooms) {
        await apiPost(`/api/projects/${projectId}/rooms`, buildRoomPayload(floorDef, room), token);
        roomsInProject += 1;
        totalRooms += 1;
        console.log(`    + ${room.name} (${room.area} m²)`);
      }
    }

    totalFloors += floorsForProject.length;
    seededProjects.push({
      id: projectId,
      name: projectPayload.name,
      floorCount: floorsForProject.length,
      roomCount: roomsInProject,
    });
  }

  console.log(
    `\n✓ Done — ${seededProjects.length} projects, ${totalFloors} floors, ${totalRooms} rooms.`,
  );
  console.log('  Seeded projects:');
  for (const project of seededProjects) {
    console.log(
      `    - ${project.name} | ${project.id} | floors=${project.floorCount}, rooms=${project.roomCount}`,
    );
  }
  console.log(`  Test login : ${TEST_USER.email} / ${TEST_USER.password}`);
  console.log(`  Open the app and log in to view the project.`);
}

main().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
