/**
 * Generating a bill of quantities from a project's equipment selections.
 *
 * Extracted from the BOQ route's POST (TASK 3.2). The handler is an HTTP
 * boundary; compiling a bill per floor, replacing the stored rows, stamping the
 * project, and recording a hash-verified snapshot is a domain pipeline.
 *
 * Mechanism: dependency inversion, as in `run-orchestrator`. Every store call
 * is declared on `BoqGenerationDeps` and supplied by the caller, so this module
 * imports nothing from `lib/firebase` and the whole pipeline can be driven with
 * in-memory fakes.
 */

import { compileBOQ } from '@/lib/functions/cost-engine';
import { computeBoqHash } from '@/lib/functions/boq-integrity';
import { buildBoqInputs, groupByFloor, type SelectedEquipmentInput } from './boq-inputs';
import type { ResolvedPricingPolicy } from './pricing-policy';
import type { StoredBoqItem } from './boq-summary';
import type { BOQItem } from '@/types/material';
import type { BoqItemRecord } from '@/lib/firebase/project-estimation-store';
import type { BoqSnapshotEventType, BoqSnapshotRecord } from '@/lib/firebase/boq-snapshot-store';
import type { AuditLogInput } from '@/lib/firebase/projects-store';

/** A floor and the rooms on it, as the project store returns them. */
export interface FloorWithRooms {
  name?: string;
  rooms: { id: string; area?: number }[];
}

/** A row as `replaceBoqItemsForProject` accepts it. */
export type NewBoqItemRecord = Omit<
  BoqItemRecord,
  'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'overrideUpdatedAt'
> & { overrideUpdatedAt?: string | null };

export interface BoqGenerationDeps {
  getFloorsWithRooms: (projectId: string) => Promise<FloorWithRooms[]>;
  listSelectedEquipmentForProject: (projectId: string) => Promise<
    { equipment: SelectedEquipmentInput['equipment']; quantity: number; roomId: string }[]
  >;
  replaceBoqItemsForProject: (
    projectId: string,
    items: NewBoqItemRecord[],
  ) => Promise<unknown>;
  listBoqItemsForProject: (projectId: string) => Promise<StoredBoqItem[]>;
  updateProjectRecord: (projectId: string, patch: Record<string, unknown>) => Promise<unknown>;
  createBoqSnapshot: (input: {
    projectId: string;
    eventType: BoqSnapshotEventType;
    boqHash: string;
    itemCount: number;
    grandTotalPhp: number;
    triggeredBy: string;
  }) => Promise<BoqSnapshotRecord>;
  writeAuditLog: (entry: AuditLogInput) => Promise<unknown>;
  now: () => Date;
}

export type BoqGenerationFailureReason = 'NO_EQUIPMENT';

export interface BoqGenerationFailure {
  ok: false;
  reason: BoqGenerationFailureReason;
  message: string;
}

export interface BoqGenerationSuccess {
  ok: true;
  boq: ReturnType<typeof compileBOQ> & { items: BOQItem[] };
}

export type BoqGenerationOutcome = BoqGenerationSuccess | BoqGenerationFailure;

/** The single mapping from a domain reason to an HTTP status. */
export const BOQ_GENERATION_STATUS: Record<BoqGenerationFailureReason, number> = {
  NO_EQUIPMENT: 400,
};

/**
 * Map each room to the floor it belongs to.
 *
 * A selection whose room is not on any floor is labelled `Unassigned` rather
 * than dropped: excluding it would silently understate the bill.
 */
function buildRoomFloorMap(floors: FloorWithRooms[]): Map<string, string> {
  const roomFloor = new Map<string, string>();
  for (const floor of floors) {
    for (const room of floor.rooms) {
      roomFloor.set(room.id, floor.name || 'Unassigned');
    }
  }
  return roomFloor;
}

/** Total conditioned area across every room on every floor, m2. */
export function totalFloorAreaM2(floors: FloorWithRooms[]): number {
  return floors.reduce(
    (total, floor) => total + floor.rooms.reduce((sum, room) => sum + (room.area || 0), 0),
    0,
  );
}

/** The rate arguments `compileBOQ` takes, from a resolved policy. */
function compileRates(policy: ResolvedPricingPolicy) {
  return {
    laborMultiplier: policy.laborMultiplier.final,
    overheadPercent: policy.overheadPercent.final,
    contingencyPercent: policy.contingencyPercent.final,
    vatRate: policy.vatRate.final,
  };
}

/**
 * Compile a bill per floor, then an overall summary.
 *
 * The per-floor pass exists so each line can carry the floor it belongs to; the
 * overall pass produces the totals. Compiling once per floor and summing would
 * not give the same answer, because overhead, contingency and VAT are applied
 * to a subtotal — four floors each carrying their own overhead is not the same
 * bill as one project carrying it once.
 */
export function compileProjectBoq(
  selections: SelectedEquipmentInput[],
  policy: ResolvedPricingPolicy,
): BoqGenerationSuccess['boq'] {
  const rates = compileRates(policy);

  const items: BOQItem[] = [];
  for (const [floorName, floorSelections] of groupByFloor(selections)) {
    const floorBoq = compileBOQ({ ...buildBoqInputs(floorSelections), ...rates });
    for (const item of floorBoq.items) {
      items.push({ ...item, floorName });
    }
  }

  const overall = compileBOQ({ ...buildBoqInputs(selections), ...rates });
  return { ...overall, items };
}

/** Map a compiled line onto the stored row shape. */
function toStoredRow(item: BOQItem): NewBoqItemRecord {
  return {
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
  };
}

export interface GenerateBoqRequest {
  projectId: string;
  policy: ResolvedPricingPolicy;
  /** The authenticated caller, recorded against the snapshot and audit entry. */
  actorId: string;
}

/**
 * Regenerate a project's bill of quantities.
 *
 * Replaces every stored row, so an estimator's per-line overrides are lost —
 * that is the existing contract of this endpoint, and the snapshot written at
 * the end is what makes the change auditable.
 */
export async function generateProjectBoq(
  deps: BoqGenerationDeps,
  request: GenerateBoqRequest,
): Promise<BoqGenerationOutcome> {
  const { projectId, policy, actorId } = request;

  const [floors, selectedRecords] = await Promise.all([
    deps.getFloorsWithRooms(projectId),
    deps.listSelectedEquipmentForProject(projectId),
  ]);

  const roomFloor = buildRoomFloorMap(floors);
  const selections: SelectedEquipmentInput[] = selectedRecords.map((record) => ({
    equipment: record.equipment,
    quantity: record.quantity,
    floorName: roomFloor.get(record.roomId) || 'Unassigned',
  }));

  if (selections.length === 0) {
    return {
      ok: false,
      reason: 'NO_EQUIPMENT',
      message: 'Select equipment for this project before generating a bill of quantities.',
    };
  }

  const boq = compileProjectBoq(selections, policy);

  await deps.replaceBoqItemsForProject(projectId, boq.items.map(toStoredRow));

  await deps.updateProjectRecord(projectId, {
    totalFloorArea: totalFloorAreaM2(floors),
    isBoqStale: false,
    lastBoqGeneratedAt: deps.now().toISOString(),
  });

  // Hash the rows as stored rather than as compiled: the snapshot has to
  // attest to what a later reader will actually find.
  const storedItems = await deps.listBoqItemsForProject(projectId);
  const boqHash = computeBoqHash(storedItems);

  const snapshot = await deps.createBoqSnapshot({
    projectId,
    eventType: 'generated',
    boqHash,
    itemCount: storedItems.length,
    grandTotalPhp: boq.grandTotal,
    triggeredBy: actorId,
  });

  await deps.writeAuditLog({
    projectId,
    action: 'generated',
    entity: 'boq',
    entityId: projectId,
    details: JSON.stringify({
      itemCount: boq.items.length,
      grandTotal: boq.grandTotal,
      pricingPolicy: compileRates(policy),
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

  return { ok: true, boq };
}
