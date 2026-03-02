// ASHRAE Cooling Load Calculation Tables
// Based on ASHRAE Fundamentals - CLTD/CLF/SCL Method

// Wall U-Values (W/m²·K) by construction type
export const WALL_U_VALUES: Record<string, number> = {
  concrete_200mm: 3.42,
  concrete_150mm: 3.85,
  concrete_block_200mm: 2.87,
  concrete_block_150mm: 3.14,
  brick_200mm: 2.56,
  drywall_metal_stud: 2.20,
  curtain_wall: 5.80,
  insulated_panel: 0.45,
};

// Roof U-Values (W/m²·K)
export const ROOF_U_VALUES: Record<string, number> = {
  concrete_slab_150mm: 3.52,
  concrete_slab_200mm: 3.18,
  metal_deck_insulated: 0.50,
  metal_deck_uninsulated: 7.50,
  concrete_tile: 2.80,
};

// Glass U-Values (W/m²·K)
export const GLASS_U_VALUES: Record<string, number> = {
  single_clear_6mm: 5.80,
  single_tinted_6mm: 5.80,
  double_clear: 2.90,
  double_tinted: 2.90,
  double_low_e: 1.70,
  triple_low_e: 1.00,
};

// Glass Shading Coefficient (SC)
export const GLASS_SC_VALUES: Record<string, number> = {
  single_clear_6mm: 0.95,
  single_tinted_6mm: 0.70,
  double_clear: 0.81,
  double_tinted: 0.55,
  double_low_e: 0.37,
  triple_low_e: 0.25,
};

// Solar Heat Gain Factor (W/m²) by orientation for ~14°N latitude (Philippines)
// Peak values for clear day conditions
export const SHGF_BY_ORIENTATION: Record<string, number> = {
  N: 118,
  NE: 340,
  E: 545,
  SE: 460,
  S: 250,
  SW: 460,
  W: 545,
  NW: 340,
};

// CLTD for walls (°C) - simplified values for Group D walls (typical PH concrete)
// These are corrected for Philippine latitude, July design month, 15:00 peak hour
export const CLTD_WALL: Record<string, number> = {
  N: 8.3,
  NE: 10.5,
  E: 13.9,
  SE: 11.7,
  S: 8.9,
  SW: 11.7,
  W: 13.9,
  NW: 10.5,
};

// CLTD for roofs (°C)
export const CLTD_ROOF = 28; // Typical for concrete slab roof, no suspended ceiling

// CLTD for glass conduction (°C)
export const CLTD_GLASS = 5.0; // Simplified for Philippine conditions

// Internal heat gain per person (W)
export const HEAT_GAIN_PER_PERSON: Record<string, { sensible: number; latent: number }> = {
  office: { sensible: 75, latent: 55 },
  conference: { sensible: 75, latent: 55 },
  lobby: { sensible: 75, latent: 55 },
  retail: { sensible: 75, latent: 55 },
  restaurant: { sensible: 75, latent: 95 },
  kitchen: { sensible: 115, latent: 200 },
  hotel_room: { sensible: 65, latent: 30 },
  server_room: { sensible: 75, latent: 55 },
  corridor: { sensible: 75, latent: 55 },
  restroom: { sensible: 75, latent: 55 },
  storage: { sensible: 100, latent: 80 },
  residential: { sensible: 65, latent: 30 },
  classroom: { sensible: 75, latent: 55 },
  hospital_ward: { sensible: 60, latent: 40 },
  operating_room: { sensible: 100, latent: 80 },
  parking: { sensible: 100, latent: 80 },
};

// Occupancy density (people per m²) by space type
export const OCCUPANCY_DENSITY: Record<string, number> = {
  office: 0.1,      // 10 m²/person
  conference: 0.5,   // 2 m²/person
  lobby: 0.15,
  retail: 0.15,
  restaurant: 0.7,
  kitchen: 0.2,
  hotel_room: 0.05,
  server_room: 0.02,
  corridor: 0.05,
  restroom: 0.1,
  storage: 0.02,
  residential: 0.05,
  classroom: 0.5,
  hospital_ward: 0.1,
  operating_room: 0.15,
  parking: 0.01,
};

// Lighting power density (W/m²) by space type - typical Philippine values
export const LIGHTING_DENSITY: Record<string, number> = {
  office: 15,
  conference: 18,
  lobby: 20,
  retail: 22,
  restaurant: 18,
  kitchen: 15,
  hotel_room: 12,
  server_room: 10,
  corridor: 8,
  restroom: 10,
  storage: 6,
  residential: 10,
  classroom: 18,
  hospital_ward: 12,
  operating_room: 30,
  parking: 5,
};

// Equipment power density (W/m²) by space type
export const EQUIPMENT_DENSITY: Record<string, number> = {
  office: 15,
  conference: 5,
  lobby: 3,
  retail: 5,
  restaurant: 10,
  kitchen: 50,
  hotel_room: 5,
  server_room: 500,
  corridor: 0,
  restroom: 0,
  storage: 0,
  residential: 8,
  classroom: 10,
  hospital_ward: 15,
  operating_room: 50,
  parking: 0,
};

// Fresh air requirements (L/s per person and L/s per m²)
// Based on ASHRAE Standard 62.1
export const FRESH_AIR_REQUIREMENTS: Record<string, { perPerson: number; perArea: number }> = {
  office: { perPerson: 2.5, perArea: 0.3 },
  conference: { perPerson: 2.5, perArea: 0.3 },
  lobby: { perPerson: 2.5, perArea: 0.3 },
  retail: { perPerson: 3.8, perArea: 0.6 },
  restaurant: { perPerson: 3.8, perArea: 0.9 },
  kitchen: { perPerson: 3.8, perArea: 0.9 },
  hotel_room: { perPerson: 2.5, perArea: 0.3 },
  server_room: { perPerson: 2.5, perArea: 0.3 },
  corridor: { perPerson: 0, perArea: 0.3 },
  restroom: { perPerson: 0, perArea: 2.5 },
  storage: { perPerson: 0, perArea: 0.3 },
  residential: { perPerson: 2.5, perArea: 0.3 },
  classroom: { perPerson: 5.0, perArea: 0.6 },
  hospital_ward: { perPerson: 2.5, perArea: 0.3 },
  operating_room: { perPerson: 7.5, perArea: 0.9 },
  parking: { perPerson: 0, perArea: 7.5 },
};

// CLF for lighting (hour of operation correction factor)
export const CLF_LIGHTING = 0.85; // typical for 8-10 hours of operation

// CLF for equipment
export const CLF_EQUIPMENT = 0.90;

// Infiltration air change rate (ACH)
export const INFILTRATION_ACH: Record<string, number> = {
  tight: 0.3,
  average: 0.5,
  loose: 1.0,
  vestibule: 1.5,
};
