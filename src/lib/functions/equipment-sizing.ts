/**
 * Equipment Sizing & Selection Engine
 * Maps cooling load → appropriate HVAC equipment from Philippine catalog
 */

import { EQUIPMENT_CATALOG } from '@/constants/equipment-catalog';
import { INVERTER_EER_THRESHOLD } from '@/lib/utils/constants';
import type { EquipmentType } from '@/types/equipment';

type CatalogEntry = typeof EQUIPMENT_CATALOG[number];

interface SizingInput {
  totalLoadWatts: number;
  trValue: number;
  btuPerHour: number;
  spaceType: string;
  roomArea: number;
  ceilingHeight: number;
  budgetLevel: 'economy' | 'mid-range' | 'premium';
  preferredBrand?: string;
  preferredType?: EquipmentType;
  existingSystem?: EquipmentType;
}

export interface EquipmentRecommendation {
  equipment: {
    id: string;
    model: string;
    brand: string;
    type: EquipmentType;
    capacityTR: number;
    capacityBTU: number;
    capacityKW: number;
    eer: number;
    isInverter: boolean;
    refrigerant: string;
    powerSupply: string;
    priceMin: number;
    priceMax: number;
  };
  quantity: number;
  totalCapacityBTU: number;
  totalCapacityTR: number;
  matchScore: number;
  estimatedCost: { min: number; max: number };
  reason: string;
}

interface SizingResult {
  recommended: EquipmentRecommendation[];
  alternatives: EquipmentRecommendation[];
  notes: string[];
  warnings: string[];
}

/** Determine best equipment type for space */
function recommendType(input: SizingInput): EquipmentType[] {
  const { trValue, spaceType, ceilingHeight } = input;
  const types: EquipmentType[] = [];

  if (input.preferredType) {
    types.push(input.preferredType);
  }

  if (trValue <= 3) {
    types.push('wall_split', 'ceiling_cassette');
  } else if (trValue <= 8) {
    types.push('ceiling_cassette', 'ducted_split', 'floor_standing');
  } else if (trValue <= 20) {
    types.push('ducted_split', 'floor_standing');
  } else {
    types.push('chiller', 'ahu');
  }

  // Space-specific logic
  if (spaceType === 'server_room' || spaceType === 'data_center') {
    types.unshift('ducted_split');
  }
  if (ceilingHeight < 2.7 && types.includes('ceiling_cassette')) {
    const idx = types.indexOf('ceiling_cassette');
    types.splice(idx, 1);
    types.push('wall_split');
  }

  // Deduplicate
  return [...new Set(types)];
}

/** Filter catalog by capacity range */
function filterByCapacity(
  catalog: CatalogEntry[],
  minBTU: number,
  maxBTU: number,
  types: EquipmentType[],
  brand?: string
): CatalogEntry[] {
  return catalog.filter((eq) => {
    const matchType = types.includes(eq.type);
    const matchCapacity = eq.capacityBTU >= minBTU && eq.capacityBTU <= maxBTU;
    const matchBrand = brand ? eq.manufacturer.toLowerCase().includes(brand.toLowerCase()) : true;
    return matchType && matchCapacity && matchBrand;
  });
}

/** Score equipment for ranking */
function scoreEquipment(eq: CatalogEntry, input: SizingInput): number {
  let score = 0;

  // Capacity match (closer to needed = better)
  const neededBTU = input.btuPerHour;
  const oversize = eq.capacityBTU / neededBTU;
  if (oversize >= 1.0 && oversize <= 1.15) score += 40;
  else if (oversize >= 1.15 && oversize <= 1.3) score += 30;
  else if (oversize >= 1.0 && oversize <= 1.5) score += 20;
  else score += 5;

  // Energy efficiency
  if (eq.eer >= 12) score += 25;
  else if (eq.eer >= 10) score += 20;
  else if (eq.eer >= 8) score += 15;
  else score += 5;

  // Inverter tech bonus
  if (eq.eer >= INVERTER_EER_THRESHOLD) score += 15;

  // Budget match
  const price = eq.unitPricePHP;
  if (input.budgetLevel === 'economy' && price < 40000) score += 10;
  if (input.budgetLevel === 'mid-range' && price >= 30000 && price <= 80000) score += 10;
  if (input.budgetLevel === 'premium' && price >= 60000) score += 10;

  // Preferred brand bonus
  if (input.preferredBrand && eq.manufacturer.toLowerCase() === input.preferredBrand.toLowerCase()) {
    score += 10;
  }

  return score;
}

/** Calculate number of units needed */
function calculateUnits(eqCapacityBTU: number, requiredBTU: number): number {
  return Math.ceil(requiredBTU / eqCapacityBTU);
}

/**
 * Main equipment sizing function
 */
export function sizeEquipment(input: SizingInput): SizingResult {
  const notes: string[] = [];
  const warnings: string[] = [];
  
  const neededBTU = input.btuPerHour;
  const recommendedTypes = recommendType(input);

  // Search range: 50% to 250% of needed capacity per unit
  const minBTU = neededBTU * 0.5;
  const maxBTU = neededBTU * 2.5;

  let candidates = filterByCapacity(EQUIPMENT_CATALOG, minBTU, maxBTU, recommendedTypes, input.preferredBrand);

  // If no matches with brand, try without
  if (candidates.length === 0 && input.preferredBrand) {
    candidates = filterByCapacity(EQUIPMENT_CATALOG, minBTU, maxBTU, recommendedTypes);
    notes.push(`No ${input.preferredBrand} equipment found in capacity range. Showing all brands.`);
  }

  // If still no matches, expand type search to all available types
  if (candidates.length === 0) {
    const allTypes: EquipmentType[] = ['wall_split', 'ceiling_cassette', 'ducted_split', 'floor_standing'];
    candidates = filterByCapacity(EQUIPMENT_CATALOG, minBTU, maxBTU, allTypes);
    if (candidates.length > 0) {
      notes.push('Equipment type preference could not be matched. Showing all available types.');
    }
  }

  // If very large load or still no matches, use multiple units of the largest available equipment
  if (candidates.length === 0) {
    const allTypes: EquipmentType[] = ['wall_split', 'ceiling_cassette', 'ducted_split', 'floor_standing'];
    const largestEquipment = [...EQUIPMENT_CATALOG]
      .filter((eq) => allTypes.includes(eq.type))
      .sort((a, b) => b.capacityBTU - a.capacityBTU);
    
    if (largestEquipment.length > 0) {
      // Pick the top 5 largest unique units
      const seen = new Set<string>();
      const unique: typeof largestEquipment = [];
      for (const eq of largestEquipment) {
        const key = `${eq.manufacturer}-${eq.model}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(eq);
        }
        if (unique.length >= 5) break;
      }
      candidates = unique;
      const topUnit = largestEquipment[0];
      const unitsNeeded = Math.ceil(neededBTU / topUnit.capacityBTU);
      notes.push(`Load exceeds single-unit capacity. Recommending ${unitsNeeded}× ${topUnit.manufacturer} ${topUnit.model} (${topUnit.capacityBTU.toLocaleString()} BTU/h each).`);
      if (input.trValue > 50) {
        warnings.push('Very large cooling load (>50 TR). Consider central chiller system with AHUs for better efficiency.');
      }
    }
  }

  // Score and sort
  const scored = candidates.map((eq) => ({
    equipment: eq,
    score: scoreEquipment(eq, input),
    units: calculateUnits(eq.capacityBTU, neededBTU),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Build recommendations
  const recommendations: EquipmentRecommendation[] = scored.map((s) => {
    const isInverter = s.equipment.eer >= INVERTER_EER_THRESHOLD;
    return {
      equipment: {
        id: s.equipment.model.replace(/[\s\-\/]/g, '_'),
        model: s.equipment.model,
        brand: s.equipment.manufacturer,
        type: s.equipment.type,
        capacityTR: s.equipment.capacityTR,
        capacityBTU: s.equipment.capacityBTU,
        capacityKW: s.equipment.capacityKW,
        eer: s.equipment.eer,
        isInverter,
        refrigerant: s.equipment.refrigerant,
        powerSupply: `${s.equipment.voltage}V ${s.equipment.phase}`,
        priceMin: s.equipment.unitPricePHP * 0.9,
        priceMax: s.equipment.unitPricePHP * 1.1,
      },
      quantity: s.units,
      totalCapacityBTU: s.equipment.capacityBTU * s.units,
      totalCapacityTR: s.equipment.capacityTR * s.units,
      matchScore: s.score,
      estimatedCost: {
        min: s.equipment.unitPricePHP * 0.9 * s.units,
        max: s.equipment.unitPricePHP * 1.1 * s.units,
      },
      reason: buildReason(s.equipment, s.score, s.units),
    };
  });

  // Capacity warnings
  if (input.trValue > 50) {
    warnings.push('Very large cooling load. Consider central chiller system with AHUs.');
  }
  if (input.trValue > 5 && recommendedTypes.includes('wall_split')) {
    warnings.push('Wall-mounted splits not ideal for loads > 5 TR. Consider cassette or ducted units.');
  }

  return {
    recommended: recommendations.slice(0, 3),
    alternatives: recommendations.slice(3, 8),
    notes,
    warnings,
  };
}

function buildReason(eq: CatalogEntry, score: number, units: number): string {
  const parts: string[] = [];
  if (eq.eer >= INVERTER_EER_THRESHOLD) parts.push('Inverter technology for energy savings');
  if (eq.eer >= 12) parts.push('High energy efficiency (EER ' + eq.eer + ')');
  if (units > 1) parts.push(`${units} units for complete coverage`);
  parts.push(`${eq.manufacturer} ${eq.model}`);
  return parts.join('. ');
}

/**
 * Quick TR estimate from room area — Philippine HVAC rule of thumb.
 * Uses the SAME factors as the main cooling load engine.
 *   e.g.  75 m² office → 75 / 15 = 5 TR
 */
export { SQM_PER_TR } from '@/lib/functions/cooling-load';

export function quickEstimateTR(
  areaSqM: number,
  spaceType: string = 'office',
  ceilingHeight: number = 2.7
): number {
  // Import the canonical factors at module level would create
  // a circular dep, so inline the same table:
  const SQM: Record<string, number> = {
    office: 15,
    conference: 12,
    lobby: 18,
    retail: 12,
    restaurant: 10,
    kitchen: 8,
    hotel_room: 18,
    server_room: 8,
    corridor: 25,
    restroom: 25,
    storage: 30,
    residential: 18,
    classroom: 12,
    hospital_ward: 12,
    operating_room: 8,
    parking: 40,
  };

  const sqmPerTR = SQM[spaceType] || 15;
  let tr = areaSqM / sqmPerTR;

  // Adjust for tall ceilings (ref: 2.7 m)
  if (ceilingHeight > 2.7) {
    tr *= ceilingHeight / 2.7;
  }

  return Math.round(tr * 100) / 100;
}
