/**
 * Production wiring for BOQ generation.
 *
 * The single place the generator meets real Firestore and the real cost engine.
 * Kept out of the route because binding persistence to a service is not an HTTP
 * concern (CLAUDE.md §2.7). A test supplies its own object of the same type.
 */

import { createBoqSnapshot } from '@/lib/firebase/boq-snapshot-store';
import {
  listBoqItemsForProject,
  listSelectedEquipmentForProject,
  replaceBoqItemsForProject,
} from '@/lib/firebase/project-estimation-store';
import {
  getFloorsWithRooms,
  getProjectRecord,
  updateProjectRecord,
  writeAuditLog,
} from '@/lib/firebase/projects-store';
import { compileBOQ } from '@/lib/functions/cost-engine';
import { computeBoqHash } from '@/lib/functions/boq-integrity';
import type { GenerateBoqDeps } from '@/lib/boq/generate-boq';

export const productionBoqDeps: GenerateBoqDeps = {
  getProjectRecord,
  getFloorsWithRooms,
  listSelectedEquipmentForProject,
  replaceBoqItemsForProject,
  listBoqItemsForProject,
  updateProjectRecord,
  createBoqSnapshot,
  writeAuditLog,
  compileBOQ,
  computeBoqHash,
};
