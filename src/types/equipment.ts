export type EquipmentType = 'wall_split' | 'ceiling_cassette' | 'floor_standing' | 'ducted_split' | 'vrf_indoor' | 'vrf_outdoor' | 'chiller' | 'ahu' | 'fcu';
export type RefrigerantType = 'R410A' | 'R32' | 'R22' | 'R134a';
export type PhaseType = '1-phase' | '3-phase';

export interface Equipment {
  id: string;
  manufacturer: string;
  model: string;
  type: EquipmentType;
  capacityTR: number;
  capacityBTU: number;
  capacityKW: number;
  powerInputKW: number;
  currentAmps: number;
  phase: PhaseType;
  voltage: number;
  refrigerant: RefrigerantType;
  eer: number;
  cop: number;
  indoorDimensions: string; // WxHxD mm
  outdoorDimensions: string;
  indoorWeight: number; // kg
  outdoorWeight: number;
  maxPipeLength: number; // meters
  maxElevation: number; // meters
  liquidPipeSize: string; // inches
  gasPipeSize: string;
  unitPricePHP: number;
  imageUrl?: string;
}

export interface SelectedEquipment {
  id: string;
  roomId: string;
  equipmentId: string;
  equipment: Equipment;
  quantity: number;
  position: { x: number; y: number };
  derating: {
    pipeLengthFactor: number;
    elevationFactor: number;
    ambientFactor: number;
    effectiveCapacity: number;
  };
}

export interface EquipmentRecommendation {
  equipment: Equipment;
  score: number; // 0-100 fitness score
  reason: string;
  effectiveCapacity: number;
  annualEnergyCost: number;
  warnings: string[];
}
