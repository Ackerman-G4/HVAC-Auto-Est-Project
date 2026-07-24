import type { psychrometricState } from '@/lib/functions/psychrometric';

export type PsychrometricSnapshot = ReturnType<typeof psychrometricState>;

export interface ProjectData {
  id: string;
  name: string;
  clientName: string;
  buildingType: string;
  status: string;
  location: string;
  city: string;
  totalFloorArea: number;
  outdoorDB: number;
  outdoorWB: number;
  outdoorRH: number;
  indoorDB: number;
  indoorRH: number;
  notes: string;
  suggestedLaborMultiplier?: number;
  laborMultiplierOverride?: number | null;
  suggestedOverheadPercent?: number;
  overheadPercentOverride?: number | null;
  suggestedContingencyPercent?: number;
  contingencyPercentOverride?: number | null;
  suggestedVatRate?: number;
  vatRateOverride?: number | null;
  isBoqStale?: boolean;
  lastBoqGeneratedAt?: string | null;
  pricingPolicy?: {
    laborMultiplier: number;
    overheadPercent: number;
    contingencyPercent: number;
    vatRate: number;
  };
  floors: {
    id: string;
    floorNumber: number;
    name: string;
    rooms: {
      id: string;
      name: string;
      spaceType: string;
      area: number;
      perimeter: number;
      polygon?: string;
      ceilingHeight: number;
      wallConstruction: string;
      windowType: string;
      windowArea: number;
      windowOrientation: string;
      occupantCount: number;
      lightingDensity: number;
      equipmentLoad: number;
      hasRoofExposure: boolean;
      coolingLoad?: {
        totalLoad: number;
        trValue: number;
        btuPerHour: number;
        suggestedTrValue?: number;
        userTrOverride?: number | null;
        finalTrValue?: number;
        suggestedBtuPerHour?: number;
        userBtuOverride?: number | null;
        finalBtuPerHour?: number;
        isOverridden?: boolean;
        totalSensibleLoad: number;
        totalLatentLoad: number;
        wallLoad: number;
        roofLoad: number;
        glassSolarLoad: number;
        glassConductionLoad: number;
        lightingLoad: number;
        peopleLoadSensible: number;
        peopleLoadLatent: number;
        equipmentLoadSensible: number;
        ventilationLoadSensible: number;
        ventilationLoadLatent: number;
        cfmSupply: number;
        cfmReturn: number;
      } | null;
    }[];
  }[];
  selectedEquipment: {
    id: string;
    roomId: string;
    brand: string;
    model: string;
    type: string;
    capacityTR: number;
    capacityBTU: number;
    quantity: number;
    suggestedQuantity?: number;
    userQuantityOverride?: number | null;
    suggestedUnitPrice?: number;
    userUnitPriceOverride?: number | null;
    unitPrice: number;
    totalPrice: number;
    eer: number;
    isInverter: boolean;
    sourceState?: 'suggested' | 'override';
    isOverridden?: boolean;
  }[];
  boqItems: {
    id: string;
    section: string;
    description: string;
    quantity: number;
    unit: string;
    suggestedUnitPrice?: number;
    suggestedTotalPrice?: number;
    userUnitPriceOverride?: number | null;
    userTotalPriceOverride?: number | null;
    finalUnitPrice?: number;
    finalTotalPrice?: number;
    sourceState?: 'suggested' | 'override';
    isOverridden?: boolean;
    overrideReason?: string;
    unitPrice: number;
    totalPrice: number;
  }[];
}

export type PricingDraftState = {
  laborMultiplier: string;
  overheadPercent: string;
  contingencyPercent: string;
  vatRate: string;
};

export type RoomLoadDraftState = {
  tr: string;
  btu: string;
};

export type EquipmentDraftState = {
  quantity: string;
  unitPrice: string;
};

export type LocalProjectSnapshot = {
  version: 1;
  projectId: string;
  savedAt: string;
  project: ProjectData;
  boqDraftPrices: Record<string, string>;
  pricingDraft: PricingDraftState;
  roomLoadDrafts: Record<string, RoomLoadDraftState>;
  equipmentDrafts: Record<string, EquipmentDraftState>;
};

export interface BoqVerification {
  status: 'verified' | 'tampered' | 'no_snapshot' | 'empty';
  boqHash: string;
  snapshotHash: string | null;
  lockedAt: string | null;
  grandTotalPhp: number | null;
  itemCount: number | null;
  deltaPhp: number | null;
}
