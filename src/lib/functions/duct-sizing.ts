/**
 * Duct Sizing Engine
 * Equal Friction Method per ASHRAE standards
 * Outputs rectangular and round duct dimensions
 */

export interface DuctSizingInput {
  cfm: number;
  maxVelocity?: number;   // fpm, default varies by application
  frictionRate?: number;   // in w.g. per 100 ft, default 0.08
  aspectRatioMax?: number; // max W:H ratio, default 4:1
  material?: 'galvanized' | 'aluminum' | 'fiberglass';
  isReturn?: boolean;
}

export interface DuctSizingResult {
  roundDiameter: number;    // inches
  rectWidth: number;        // inches
  rectHeight: number;       // inches
  velocity: number;         // fpm
  frictionLoss: number;     // in w.g. per 100 ft
  areaRequired: number;     // sq in
  equivalentDiameter: number; // inches
  materialGauge: string;
  insulationType: string;
  insulationThickness: number; // inches
}

/** Standard rectangular duct sizes (inches) */
const STANDARD_SIZES = [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 52, 56, 60];

/** Recommended max velocity by application (fpm) */
const MAX_VELOCITY: Record<string, number> = {
  main_supply: 1200,
  branch_supply: 900,
  main_return: 1000,
  branch_return: 700,
  outdoor_intake: 500,
  exhaust: 1000,
};

/** GI sheet gauge by duct dimension */
function getGaugeForDuct(maxDimension: number): string {
  if (maxDimension <= 12) return 'G26';
  if (maxDimension <= 30) return 'G24';
  if (maxDimension <= 54) return 'G22';
  if (maxDimension <= 84) return 'G20';
  return 'G18';
}

/**
 * Calculate round duct diameter using the equal friction method
 * D = (0.109 × Q^0.90 / f^0.538)^(1/1.22)
 * Where Q = CFM, f = friction rate (in w.g. per 100 ft)
 */
function calculateRoundDiameter(cfm: number, frictionRate: number): number {
  // Simplified from ASHRAE duct fitting database
  // Using Darcy-Weisbach with typical roughness
  const d = Math.pow((0.109 * Math.pow(cfm, 0.90)) / Math.pow(frictionRate, 0.538), 1 / 1.22);
  return d;
}

/**
 * Calculate equivalent rectangular dimensions
 * De = 1.3 × (a × b)^0.625 / (a + b)^0.25
 */
function equivalentDiameter(width: number, height: number): number {
  return 1.3 * Math.pow(width * height, 0.625) / Math.pow(width + height, 0.25);
}

/**
 * Find best rectangular dimensions from round equivalent
 */
function findRectangularSize(
  roundDia: number,
  cfm: number,
  maxAspectRatio: number
): { width: number; height: number } {
  const targetArea = Math.PI * Math.pow(roundDia / 2, 2);
  
  let bestW = STANDARD_SIZES[0];
  let bestH = STANDARD_SIZES[0];
  let bestDiff = Infinity;

  for (const w of STANDARD_SIZES) {
    for (const h of STANDARD_SIZES) {
      if (h > w) continue; // keep w >= h
      if (w / h > maxAspectRatio) continue;

      const de = equivalentDiameter(w, h);
      const diff = Math.abs(de - roundDia);

      // Must be at least as large as needed
      if (de >= roundDia * 0.95 && diff < bestDiff) {
        bestDiff = diff;
        bestW = w;
        bestH = h;
      }
    }
  }

  return { width: bestW, height: bestH };
}

/**
 * Main duct sizing function
 */
export function sizeDuct(input: DuctSizingInput): DuctSizingResult {
  const {
    cfm,
    maxVelocity = input.isReturn ? MAX_VELOCITY.main_return : MAX_VELOCITY.main_supply,
    frictionRate = 0.08,
    aspectRatioMax = 4,
    material = 'galvanized',
  } = input;

  // Calculate round diameter
  let roundDia = calculateRoundDiameter(cfm, frictionRate);
  
  // Check velocity constraint
  const areaRound = Math.PI * Math.pow(roundDia / 24, 2); // sq ft
  let velocity = cfm / areaRound;
  
  if (velocity > maxVelocity) {
    // Increase duct size for velocity limit
    const requiredArea = cfm / maxVelocity; // sq ft
    roundDia = Math.sqrt(requiredArea / Math.PI) * 24; // back to inches diameter
    velocity = maxVelocity;
  }

  // Snap to nearest standard round size
  const roundDiameterStd = STANDARD_SIZES.find((s) => s >= roundDia) || 60;

  // Find rectangular equivalent
  const rect = findRectangularSize(roundDiameterStd, cfm, aspectRatioMax);

  // Calculate actual velocity with selected size
  const actualArea = (rect.width * rect.height) / 144; // sq ft
  const actualVelocity = cfm / actualArea;

  // Friction loss recalculation
  const de = equivalentDiameter(rect.width, rect.height);
  const frictionLoss = frictionRate * Math.pow(roundDia / de, 1.22);

  // Insulation
  const isSupply = !input.isReturn;
  const insulationType = isSupply ? 'Armaflex/Closed-cell rubber' : 'None (return)';
  const insulationThickness = isSupply ? 0.75 : 0;

  return {
    roundDiameter: roundDiameterStd,
    rectWidth: rect.width,
    rectHeight: rect.height,
    velocity: Math.round(actualVelocity),
    frictionLoss: Math.round(frictionLoss * 1000) / 1000,
    areaRequired: Math.round(rect.width * rect.height),
    equivalentDiameter: Math.round(de * 10) / 10,
    materialGauge: getGaugeForDuct(rect.width),
    insulationType,
    insulationThickness,
  };
}

/**
 * Size all ducts for a room
 */
export function sizeRoomDucts(
  supplyFM: number,
  returnCFM: number,
  freshAirCFM: number,
  exhaustCFM: number
): {
  supplyMain: DuctSizingResult;
  returnMain: DuctSizingResult;
  freshAir: DuctSizingResult;
  exhaust: DuctSizingResult;
} {
  return {
    supplyMain: sizeDuct({ cfm: supplyFM }),
    returnMain: sizeDuct({ cfm: returnCFM, isReturn: true }),
    freshAir: sizeDuct({ cfm: freshAirCFM, maxVelocity: MAX_VELOCITY.outdoor_intake }),
    exhaust: sizeDuct({ cfm: exhaustCFM, maxVelocity: MAX_VELOCITY.exhaust }),
  };
}

/**
 * Calculate total duct material needed
 */
export function calculateDuctMaterial(
  ducts: DuctSizingResult[],
  lengths: number[] // feet per duct
): {
  totalGISqFt: number;
  totalInsulationSqFt: number;
  gauge: string;
  elbows: number;
  reducers: number;
  hangers: number;
} {
  let totalGI = 0;
  let totalInsulation = 0;
  let hangerCount = 0;

  ducts.forEach((duct, i) => {
    const length = lengths[i] || 10;
    // Perimeter in feet × length
    const perimeter = 2 * (duct.rectWidth + duct.rectHeight) / 12;
    const giArea = perimeter * length;
    totalGI += giArea;

    if (duct.insulationThickness > 0) {
      totalInsulation += giArea;
    }

    // Hangers every 4 feet
    hangerCount += Math.ceil(length / 4);
  });

  return {
    totalGISqFt: Math.round(totalGI),
    totalInsulationSqFt: Math.round(totalInsulation),
    gauge: ducts[0]?.materialGauge || 'G24',
    elbows: Math.ceil(ducts.length * 2), // estimate 2 elbows per run
    reducers: Math.ceil(ducts.length * 1), // estimate 1 reducer per run
    hangers: hangerCount,
  };
}
