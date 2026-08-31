/**
 * Equipment selection: auto-sizing across a project, and single manual picks.
 *
 * Extracted from the equipment route by REMEDIATION_PLAN.md TASK 3.2. Both
 * paths end by marking equipment fresh and the **bill of quantities stale**,
 * which is the rule that keeps a quotation from being served against equipment
 * that has since changed. That invariant lived in two hand-copied blocks inside
 * a 259-line handler.
 *
 * A price-override lookup failure is logged and swallowed on purpose: overrides
 * are an admin refinement over the catalogue price, and losing them must
 * degrade to the catalogue rather than fail the whole selection.
 */

import type { getPriceOverridesByModel, PriceOverrideRecord } from '@/lib/firebase/price-override-store';
import type {
  clearSelectedEquipmentForProject,
  createSelectedEquipmentRecord,
} from '@/lib/firebase/project-estimation-store';
import type { getFloorsWithRooms, updateProjectRecord } from '@/lib/firebase/projects-store';
import type { sizeEquipment } from '@/lib/functions/equipment-sizing';
import type { resolveManualSelection, resolveUnitPrice } from '@/lib/functions/equipment-pricing';
import { toNumber } from '@/lib/utils/api-helpers';
import { logger } from '@/lib/observability/logger';

export interface SelectEquipmentDeps {
  readonly getFloorsWithRooms: typeof getFloorsWithRooms;
  readonly updateProjectRecord: typeof updateProjectRecord;
  readonly clearSelectedEquipmentForProject: typeof clearSelectedEquipmentForProject;
  readonly createSelectedEquipmentRecord: typeof createSelectedEquipmentRecord;
  readonly getPriceOverridesByModel: typeof getPriceOverridesByModel;
  readonly sizeEquipment: typeof sizeEquipment;
  readonly resolveUnitPrice: typeof resolveUnitPrice;
  readonly resolveManualSelection: typeof resolveManualSelection;
}

export type SelectEquipmentRefusal =
  | { readonly reason: 'NO_ROOMS' }
  | { readonly reason: 'NO_LOADS' }
  | { readonly reason: 'ROOM_NOT_FOUND' };

export interface AutoSizeRow {
  readonly room: string;
  readonly equipment: {
    id: string; brand: string; model: string; type: string;
    capacityTR: number; quantity: number;
  };
  readonly alternatives: ReturnType<typeof sizeEquipment>['alternatives'];
}

export type AutoSizeResult =
  | { readonly ok: true; readonly results: AutoSizeRow[] }
  | ({ readonly ok: false } & SelectEquipmentRefusal);

export type ManualSelectResult =
  | { readonly ok: true; readonly equipment: Awaited<ReturnType<typeof createSelectedEquipmentRecord>> }
  | ({ readonly ok: false } & SelectEquipmentRefusal);

/** Rooms are read without their equipment: only loads and geometry are needed. */
const ROOM_FETCH_OPTIONS = {
  includeRoomEquipment: false,
  includeRoomEquipmentCount: false,
} as const;

/** Default EER when a catalogue record carries none; also guards a later divide. */
const FALLBACK_EER = 10;

/**
 * Selecting equipment invalidates any bill of quantities generated before it.
 * Both entry points must do this, so it is written once.
 */
async function markEquipmentFresh(
  deps: SelectEquipmentDeps,
  projectId: string,
): Promise<void> {
  await deps.updateProjectRecord(projectId, {
    isEquipmentStale: false,
    isBoqStale: true,
    lastBoqGeneratedAt: null,
    lastEquipmentSyncAt: new Date().toISOString(),
  });
}

/** Overrides are a refinement; losing them degrades to catalogue pricing. */
async function loadOverridesOrEmpty(
  deps: SelectEquipmentDeps,
  context: string,
): Promise<Map<string, PriceOverrideRecord>> {
  try {
    return await deps.getPriceOverridesByModel();
  } catch (overrideError) {
    logger.error(`${context} price override lookup failed`, overrideError);
    return new Map<string, PriceOverrideRecord>();
  }
}

/** Taken from the sizer's own signature so the preferences cannot drift from it. */
type SizingInput = Parameters<typeof sizeEquipment>[0];

export interface AutoSizePreferences {
  readonly projectId: string;
  readonly budgetLevel: SizingInput['budgetLevel'];
  readonly preferredBrand: SizingInput['preferredBrand'] | undefined;
  readonly preferredType: SizingInput['preferredType'] | undefined;
}

export async function autoSizeProjectEquipment(
  deps: SelectEquipmentDeps,
  params: AutoSizePreferences,
): Promise<AutoSizeResult> {
  const { projectId } = params;
  const floors = await deps.getFloorsWithRooms(projectId, ROOM_FETCH_OPTIONS);
  const allRooms = floors.flatMap((floor) => floor.rooms);

  if (allRooms.length === 0) return { ok: false, reason: 'NO_ROOMS' };

  const roomsWithLoads = allRooms.filter(
    (room) => room.coolingLoad && typeof room.coolingLoad === 'object',
  );
  if (roomsWithLoads.length === 0) return { ok: false, reason: 'NO_LOADS' };

  const overrides = await loadOverridesOrEmpty(deps, 'auto-size');

  // Cleared only after both refusals have passed, so a project with no loads
  // keeps the selection it already had.
  await deps.clearSelectedEquipmentForProject(projectId);

  const results: AutoSizeRow[] = [];

  for (const floor of floors) {
    for (const room of floor.rooms) {
      if (!room.coolingLoad || typeof room.coolingLoad !== 'object') continue;
      const load = room.coolingLoad as Record<string, unknown>;

      const sizing = deps.sizeEquipment({
        totalLoadWatts: toNumber(load.totalLoad, 0),
        trValue: toNumber(load.trValue, 0),
        btuPerHour: toNumber(load.btuPerHour, 0),
        spaceType: room.spaceType,
        roomArea: room.area,
        ceilingHeight: room.ceilingHeight,
        budgetLevel: params.budgetLevel,
        preferredBrand: params.preferredBrand,
        preferredType: params.preferredType,
      });

      // A room the catalogue cannot serve is skipped rather than failing the
      // whole project: the other rooms still get equipment.
      if (sizing.recommended.length === 0) continue;

      const top = sizing.recommended[0];
      const catalogPrice = (top.equipment.priceMin + top.equipment.priceMax) / 2;
      const { unitPrice, overridden } = deps.resolveUnitPrice(
        top.equipment.model,
        overrides,
        catalogPrice,
      );

      const selection = await deps.createSelectedEquipmentRecord({
        projectId,
        roomId: room.id,
        quantity: top.quantity,
        suggestedQuantity: top.quantity,
        suggestedUnitPrice: unitPrice,
        finalUnitPrice: unitPrice,
        isOverridden: overridden,
        equipment: {
          manufacturer: top.equipment.brand,
          model: top.equipment.model,
          type: top.equipment.type,
          capacityTR: top.equipment.capacityTR,
          capacityBTU: top.equipment.capacityBTU,
          capacityKW: top.equipment.capacityKW,
          unitPricePHP: unitPrice,
          eer: top.equipment.eer || FALLBACK_EER,
          refrigerant: top.equipment.refrigerant || 'R32',
          powerSupply: top.equipment.powerSupply || '',
        },
      });

      results.push({
        room: room.name,
        equipment: {
          id: selection.id,
          brand: top.equipment.brand,
          model: top.equipment.model,
          type: top.equipment.type,
          capacityTR: top.equipment.capacityTR,
          quantity: top.quantity,
        },
        alternatives: sizing.alternatives.slice(0, 3),
      });
    }
  }

  await markEquipmentFresh(deps, projectId);
  return { ok: true, results };
}

export interface ManualSelectionInput {
  roomId: string;
  quantity: number;
  model?: string | undefined;
  brand?: string | undefined;
  type?: string | undefined;
  capacityBTU?: number | undefined;
  capacityTR?: number | undefined;
  eer?: number | undefined;
  refrigerant?: string | undefined;
  unitPrice?: number | undefined;
  custom?: boolean | undefined;
  powerSupply?: string | undefined;
}

export async function selectEquipmentManually(
  deps: SelectEquipmentDeps,
  params: { projectId: string; body: ManualSelectionInput },
): Promise<ManualSelectResult> {
  const { projectId, body } = params;

  const floors = await deps.getFloorsWithRooms(projectId, ROOM_FETCH_OPTIONS);
  const roomExists = floors.some((floor) => floor.rooms.some((room) => room.id === body.roomId));
  if (!roomExists) return { ok: false, reason: 'ROOM_NOT_FOUND' };

  const overrides = await loadOverridesOrEmpty(deps, 'manual-selection');

  // Price and capacity are resolved server-side for real catalogue SKUs. The
  // client's figures are honoured only for a genuinely off-catalogue item,
  // otherwise a caller could name a real model at a price of its choosing.
  const resolved = deps.resolveManualSelection(
    {
      model: body.model,
      brand: body.brand,
      type: body.type,
      capacityBTU: body.capacityBTU,
      capacityTR: body.capacityTR,
      eer: body.eer,
      refrigerant: body.refrigerant,
      unitPrice: body.unitPrice,
      custom: body.custom === true,
    },
    overrides,
  );

  const selection = await deps.createSelectedEquipmentRecord({
    projectId,
    roomId: body.roomId,
    quantity: body.quantity,
    suggestedQuantity: body.quantity,
    suggestedUnitPrice: resolved.unitPricePHP,
    finalUnitPrice: resolved.unitPricePHP,
    isOverridden: resolved.overridden,
    equipment: {
      manufacturer: resolved.manufacturer,
      model: resolved.model,
      type: resolved.type,
      capacityTR: resolved.capacityTR,
      capacityBTU: resolved.capacityBTU,
      capacityKW: resolved.capacityKW,
      unitPricePHP: resolved.unitPricePHP,
      eer: resolved.eer,
      refrigerant: resolved.refrigerant,
      powerSupply: body.powerSupply || '',
    },
  });

  await markEquipmentFresh(deps, projectId);
  return { ok: true, equipment: selection };
}
