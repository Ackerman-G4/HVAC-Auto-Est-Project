export const APP_NAME = 'HVAC AutoEstimate';
export const APP_VERSION = '1.0.0';
export const VAT_RATE = 0.12; // 12% Philippine VAT

export const CFM_PER_TR = 400; // Standard CFM per TR

/**
 * Watts per Ton of Refrigeration.
 * One constant for all conversions — avoids hardcoding 3517 everywhere.
 */
export const WATTS_PER_TR = 3517;

/**
 * BTU/h per Ton of Refrigeration.
 */
export const BTU_PER_TR = 12000;

/**
 * Heuristic: equipment with EER ≥ this threshold is treated as inverter‑type.
 * Changing this single value updates the whole app.
 */
export const INVERTER_EER_THRESHOLD = 11;

export const SPACE_TYPE_LABELS: Record<string, string> = {
  office: 'Office',
  conference: 'Conference Room',
  lobby: 'Lobby / Reception',
  retail: 'Retail / Shop',
  restaurant: 'Restaurant / Dining',
  kitchen: 'Kitchen',
  hotel_room: 'Hotel Room',
  server_room: 'Server / IT Room',
  corridor: 'Corridor / Hallway',
  restroom: 'Restroom',
  storage: 'Storage',
  residential: 'Residential',
  classroom: 'Classroom',
  hospital_ward: 'Hospital Ward',
  operating_room: 'Operating Room',
  parking: 'Parking',
};

export const WALL_TYPE_LABELS: Record<string, string> = {
  concrete_200mm: 'Concrete 200mm',
  concrete_150mm: 'Concrete 150mm',
  concrete_block_200mm: 'CHB 200mm',
  concrete_block_150mm: 'CHB 150mm',
  brick_200mm: 'Brick 200mm',
  drywall_metal_stud: 'Drywall / Metal Stud',
  curtain_wall: 'Curtain Wall',
  insulated_panel: 'Insulated Panel',
};

export const GLASS_TYPE_LABELS: Record<string, string> = {
  single_clear_6mm: 'Single Clear 6mm',
  single_tinted_6mm: 'Single Tinted 6mm',
  double_clear: 'Double Clear',
  double_tinted: 'Double Tinted',
  double_low_e: 'Double Low-E',
  triple_low_e: 'Triple Low-E',
};

export const ORIENTATION_LABELS: Record<string, string> = {
  N: 'North',
  NE: 'Northeast',
  E: 'East',
  SE: 'Southeast',
  S: 'South',
  SW: 'Southwest',
  W: 'West',
  NW: 'Northwest',
};

export const BUILDING_TYPE_LABELS: Record<string, string> = {
  office: 'Office Building',
  retail: 'Retail / Commercial',
  residential: 'Residential',
  hotel: 'Hotel / Resort',
  hospital: 'Hospital / Clinic',
  restaurant: 'Restaurant / F&B',
  warehouse: 'Warehouse / Industrial',
  school: 'School / University',
  mixed: 'Mixed Use',
};

export const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  wall_split: 'Wall-Mounted Split',
  ceiling_cassette: 'Ceiling Cassette',
  floor_standing: 'Floor Standing',
  ducted_split: 'Ducted Split',
  vrf_indoor: 'VRF Indoor Unit',
  vrf_outdoor: 'VRF Outdoor Unit',
  chiller: 'Chiller',
  ahu: 'Air Handling Unit',
  fcu: 'Fan Coil Unit',
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
  deleted: 'Deleted',
};

export const PROJECT_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-silver text-foreground',
  active: 'bg-accent text-white',
  archived: 'bg-muted text-muted-foreground',
  deleted: 'bg-destructive/10 text-destructive',
};
