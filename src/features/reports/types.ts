import type { EquipmentSelectionResult } from '@/lib/engine/hvac/equipment-selection-engine';

export type EquipmentCandidate = EquipmentSelectionResult['candidates'][number];

export interface LoadBreakdownDatum {
  component: string;
  btu: number;
}
