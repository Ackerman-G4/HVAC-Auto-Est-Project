export interface CoolingLoadResult {
  roomId: string;
  roomName: string;
  
  // Sensible load components (Watts)
  wallLoad: number;
  roofLoad: number;
  glassSolarLoad: number;
  glassConductionLoad: number;
  lightingLoad: number;
  peopleLoadSensible: number;
  equipmentLoadSensible: number;
  infiltrationLoadSensible: number;
  ventilationLoadSensible: number;
  
  // Latent load components (Watts)
  peopleLoadLatent: number;
  infiltrationLoadLatent: number;
  ventilationLoadLatent: number;
  
  // Totals
  totalSensibleLoad: number;
  totalLatentLoad: number;
  totalLoad: number;
  trValue: number; // Tons of refrigeration
  btuPerHour: number;
  
  // Airflow
  cfmSupply: number;
  cfmFreshAir: number;
  cfmReturn: number;
  cfmExhaust: number;
  
  // Meta
  safetyFactor: number;
  diversityFactor: number;
  calculationMethod: 'CLTD_CLF' | 'RTS' | 'CARRIER_HAP' | 'AREA_RULE_OF_THUMB' | 'manual';
  timestamp: string;
}

export interface ZoneLoadResult {
  zoneId: string;
  zoneName: string;
  rooms: CoolingLoadResult[];
  totalTR: number;
  totalCFM: number;
  diversityFactor: number;
  adjustedTR: number;
}

export interface FloorLoadResult {
  floorId: string;
  floorName: string;
  zones: ZoneLoadResult[];
  totalTR: number;
  totalCFM: number;
  grandLoad: number; // GL - Total cooling load in Watts
  grandResult: number; // GR - Total TR after all factors
}

export interface CoolingLoadInput {
  roomArea: number;
  roomPerimeter: number;
  ceilingHeight: number;
  spaceType: string;
  occupantCount: number;
  lightingDensity: number;
  equipmentLoad: number;
  wallConstruction: string;
  wallArea: number;
  roofArea: number;
  windowArea: number;
  windowOrientation: string;
  windowType: string;
  outdoorDB: number;
  outdoorWB: number;
  outdoorRH: number;
  indoorDB: number;
  indoorRH: number;
  latitude?: number;
  safetyFactor: number;
  diversityFactor: number;
  month?: number;
  hour?: number;
}
