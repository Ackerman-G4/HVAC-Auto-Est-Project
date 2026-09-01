/**
 * Binds the BOQ pipeline to the real Firestore stores.
 *
 * Separated from the route so the handler imports one value instead of eight
 * store functions, and so the wiring is stated once. `lib/boq` itself imports
 * nothing from `lib/firebase`; this is the only place the two are joined.
 */

import {
  listBoqItemsForProject,
  listSelectedEquipmentForProject,
  replaceBoqItemsForProject,
} from '@/lib/firebase/project-estimation-store';
import { createBoqSnapshot } from '@/lib/firebase/boq-snapshot-store';
import {
  getFloorsWithRooms,
  updateProjectRecord,
  writeAuditLog,
} from '@/lib/firebase/projects-store';
import type { BoqGenerationDeps } from './boq-generation';

export const boqGenerationDeps: BoqGenerationDeps = {
  getFloorsWithRooms,
  listSelectedEquipmentForProject,
  replaceBoqItemsForProject,
  listBoqItemsForProject,
  updateProjectRecord,
  createBoqSnapshot,
  writeAuditLog,
  now: () => new Date(),
};
