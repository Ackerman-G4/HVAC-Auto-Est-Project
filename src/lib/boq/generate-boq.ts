/**
 * Bill of quantities generation.
 *
 * Extracted from the BOQ route by REMEDIATION_PLAN.md TASK 3.2. This is the
 * money path end to end: it reads the equipment selections, sizes every duct,
 * pipe and cable behind them, compiles the priced bill, replaces the stored
 * rows, snapshots the hash and writes the audit entry.
 *
 * All of that lived in a route handler, so the one branch that matters most —
 * "no equipment selected" — and the ordering of persist, snapshot and audit
 * were reachable only through an HTTP request. Dependencies are injected, and
 * the Firebase imports are `import type` only, erased at compile time.
 */

import type { compileBOQ } from '@/lib/functions/cost-engine';
import type { computeBoqHash } from '@/lib/functions/boq-integrity';
import type { createBoqSnapshot } from '@/lib/firebase/boq-snapshot-store';
import type {
  listBoqItemsForProject,
  listSelectedEquipmentForProject,
  replaceBoqItemsForProject,
} from '@/lib/firebase/project-estimation-store';
import type {
  getFloorsWithRooms,
  getProjectRecord,
  updateProjectRecord,
  writeAuditLog,
} from '@/lib/firebase/projects-store';
import {
  buildBoqInputs,
  groupByFloor,
  type SelectedEquipment,
} from '@/lib/engine/cost/boq-inputs';
import {
  resolvePricingPolicy,
  type ResolvedPricingPolicy,
} from '@/lib/engine/cost/boq-pricing-policy';
import type { BOQItem } from '@/types/material';

export interface GenerateBoqDeps {
  readonly getProjectRecord: typeof getProjectRecord;
  readonly getFloorsWithRooms: typeof getFloorsWithRooms;
  readonly listSelectedEquipmentForProject: typeof listSelectedEquipmentForProject;
  readonly replaceBoqItemsForProject: typeof replaceBoqItemsForProject;
  readonly listBoqItemsForProject: typeof listBoqItemsForProject;
  readonly updateProjectRecord: typeof updateProjectRecord;
  readonly createBoqSnapshot: typeof createBoqSnapshot;
  readonly writeAuditLog: typeof writeAuditLog;
  readonly compileBOQ: typeof compileBOQ;
  readonly computeBoqHash: typeof computeBoqHash;
}

export type GenerateBoqRefusal =
  | { readonly reason: 'PROJECT_NOT_FOUND' }
  | { readonly reason: 'NO_EQUIPMENT' };

export type GenerateBoqResult =
  | { readonly ok: true; readonly boq: ReturnType<typeof compileBOQ> }
  | ({ readonly ok: false } & GenerateBoqRefusal);

/** The four multipliers, in the shape `compileBOQ` expects. */
function policyInputs(policy: ResolvedPricingPolicy) {
  return {
    laborMultiplier: policy.laborMultiplier.final,
    overheadPercent: policy.overheadPercent.final,
    contingencyPercent: policy.contingencyPercent.final,
    vatRate: policy.vatRate.final,
  };
}

export async function generateBoqForProject(
  deps: GenerateBoqDeps,
  params: { projectId: string; actorId: string },
): Promise<GenerateBoqResult> {
  const { projectId, actorId } = params;

  const project = await deps.getProjectRecord(projectId);
  if (!project) return { ok: false, reason: 'PROJECT_NOT_FOUND' };

  const policy = resolvePricingPolicy(project);

  const [floors, selectedRecords] = await Promise.all([
    deps.getFloorsWithRooms(projectId),
    deps.listSelectedEquipmentForProject(projectId),
  ]);

  const roomFloorMap = new Map<string, string>();
  for (const floor of floors) {
    for (const room of floor.rooms) {
      roomFloorMap.set(room.id, floor.name || 'Unassigned');
    }
  }

  const selectedEquipment: SelectedEquipment[] = selectedRecords.map((selection) => ({
    equipment: selection.equipment,
    quantity: selection.quantity,
    floorName: roomFloorMap.get(selection.roomId) || 'Unassigned',
  }));

  // Refused before any write: generating an empty bill would replace a real one.
  if (selectedEquipment.length === 0) return { ok: false, reason: 'NO_EQUIPMENT' };

  // Compiled per floor so each item carries the floor it belongs to, then once
  // over everything for the summary totals. Compiling only per floor and adding
  // the floors up would apply overhead, contingency and VAT once per floor.
  const allItems: BOQItem[] = [];
  for (const [floorName, floorEquipment] of groupByFloor(selectedEquipment)) {
    const floorBoq = deps.compileBOQ({ ...buildBoqInputs(floorEquipment), ...policyInputs(policy) });
    for (const item of floorBoq.items) allItems.push({ ...item, floorName });
  }

  const overall = deps.compileBOQ({
    ...buildBoqInputs(selectedEquipment),
    ...policyInputs(policy),
  });
  const boqSummary = { ...overall, items: allItems };

  await deps.replaceBoqItemsForProject(
    projectId,
    boqSummary.items.map((item) => ({
      section: item.section,
      description: item.description,
      specification: item.specification || '',
      quantity: item.quantity,
      unit: item.unit,
      suggestedUnitPrice: item.unitPrice,
      suggestedTotalPrice: item.totalPrice,
      userUnitPriceOverride: null,
      userTotalPriceOverride: null,
      finalUnitPrice: item.unitPrice,
      finalTotalPrice: item.totalPrice,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      sourceState: 'suggested',
      isOverridden: false,
      overrideReason: '',
      notes: item.floorName || '',
      category: item.category,
    })),
  );

  const totalFloorArea = floors.reduce(
    (acc, floor) => acc + floor.rooms.reduce((sum, room) => sum + (room.area || 0), 0),
    0,
  );

  await deps.updateProjectRecord(projectId, {
    totalFloorArea,
    isBoqStale: false,
    lastBoqGeneratedAt: new Date().toISOString(),
  });

  // Hashed from what was stored, not from what was compiled: the snapshot has
  // to attest to the rows a reader will actually get back.
  const storedItems = await deps.listBoqItemsForProject(projectId);
  const boqHash = deps.computeBoqHash(storedItems);
  const snapshot = await deps.createBoqSnapshot({
    projectId,
    eventType: 'generated',
    boqHash,
    itemCount: storedItems.length,
    grandTotalPhp: boqSummary.grandTotal,
    triggeredBy: actorId,
  });

  await deps.writeAuditLog({
    projectId,
    action: 'generated',
    entity: 'boq',
    entityId: projectId,
    details: JSON.stringify({
      itemCount: boqSummary.items.length,
      grandTotal: boqSummary.grandTotal,
      pricingPolicy: policyInputs(policy),
      boqHash,
      snapshot: {
        id: snapshot.id,
        algorithm: snapshot.algorithm,
        itemCount: snapshot.itemCount,
        grandTotalPhp: snapshot.grandTotalPhp,
        deltaPhp: snapshot.deltaPhp,
        createdAt: snapshot.createdAt,
      },
    }),
  });

  return { ok: true, boq: boqSummary };
}
