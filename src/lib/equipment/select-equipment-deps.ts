/** Production wiring for equipment selection. See select-equipment.ts. */

import { getPriceOverridesByModel } from '@/lib/firebase/price-override-store';
import {
  clearSelectedEquipmentForProject,
  createSelectedEquipmentRecord,
} from '@/lib/firebase/project-estimation-store';
import { getFloorsWithRooms, updateProjectRecord } from '@/lib/firebase/projects-store';
import { sizeEquipment } from '@/lib/functions/equipment-sizing';
import { resolveManualSelection, resolveUnitPrice } from '@/lib/functions/equipment-pricing';
import type { SelectEquipmentDeps } from '@/lib/equipment/select-equipment';

export const productionEquipmentDeps: SelectEquipmentDeps = {
  getFloorsWithRooms,
  updateProjectRecord,
  clearSelectedEquipmentForProject,
  createSelectedEquipmentRecord,
  getPriceOverridesByModel,
  sizeEquipment,
  resolveUnitPrice,
  resolveManualSelection,
};
