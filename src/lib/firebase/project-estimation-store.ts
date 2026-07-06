import { randomUUID } from 'crypto';
import { getFirebaseDb } from '@/lib/firebase/server';
import { INVERTER_EER_THRESHOLD } from '@/lib/utils/constants';
import {
  nowIso,
  toBooleanValue as toBoolValue,
  toIntValue,
  toNullableNumberValue as toNullableNumber,
  toNullableStringValue as toNullableString,
  toNumberValue,
  toStringValue,
} from '@/lib/firebase/value-utils';

const COLLECTIONS = {
  selectedEquipment: 'selectedEquipment',
  boqItems: 'boqItems',
} as const;

export interface EquipmentSpec {
  manufacturer: string;
  model: string;
  type: string;
  capacityTR: number;
  capacityBTU: number;
  capacityKW: number;
  unitPricePHP: number;
  eer: number;
  refrigerant: string;
  powerSupply: string;
}

export interface SelectedEquipmentRecord {
  id: string;
  projectId: string;
  roomId: string;
  quantity: number;
  suggestedQuantity: number;
  userQuantityOverride: number | null;
  suggestedUnitPrice: number;
  userUnitPriceOverride: number | null;
  finalUnitPrice: number;
  isOverridden: boolean;
  overrideReason: string;
  overrideUpdatedAt: string | null;
  equipment: EquipmentSpec;
  createdAt: string;
  updatedAt: string;
}

export interface BoqItemRecord {
  id: string;
  projectId: string;
  section: string;
  category: string;
  description: string;
  specification: string;
  quantity: number;
  unit: string;
  suggestedUnitPrice: number;
  suggestedTotalPrice: number;
  userUnitPriceOverride: number | null;
  userTotalPriceOverride: number | null;
  finalUnitPrice: number;
  finalTotalPrice: number;
  unitPrice: number;
  totalPrice: number;
  sourceState: string;
  isOverridden: boolean;
  overrideReason: string;
  overrideUpdatedAt: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

function mapEquipmentSpec(data: Record<string, unknown>): EquipmentSpec {
  const capacityBTU = toNumberValue(data.capacityBTU, 0);
  const eer = toNumberValue(data.eer, 10);
  const capacityTR = toNumberValue(data.capacityTR, capacityBTU / 12000);
  return {
    manufacturer: toStringValue(data.manufacturer, toStringValue(data.brand, '')),
    model: toStringValue(data.model, ''),
    type: toStringValue(data.type, 'wall_split'),
    capacityTR,
    capacityBTU,
    capacityKW: toNumberValue(data.capacityKW, capacityBTU * 0.000293),
    unitPricePHP: toNumberValue(data.unitPricePHP, toNumberValue(data.unitPrice, 0)),
    eer,
    refrigerant: toStringValue(data.refrigerant, 'R32'),
    powerSupply: toStringValue(data.powerSupply, ''),
  };
}

function mapSelectedEquipmentRecord(id: string, data: Record<string, unknown>): SelectedEquipmentRecord {
  const equipmentData = data.equipment && typeof data.equipment === 'object'
    ? (data.equipment as Record<string, unknown>)
    : data;

  const equipment = mapEquipmentSpec(equipmentData);
  const quantity = Math.max(0, toIntValue(data.quantity, 1));
  const suggestedQuantity = Math.max(0, toIntValue(data.suggestedQuantity, quantity));

  return {
    id,
    projectId: toStringValue(data.projectId, ''),
    roomId: toStringValue(data.roomId, ''),
    quantity,
    suggestedQuantity,
    userQuantityOverride: toNullableNumber(data.userQuantityOverride, null),
    suggestedUnitPrice: toNumberValue(data.suggestedUnitPrice, equipment.unitPricePHP),
    userUnitPriceOverride: toNullableNumber(data.userUnitPriceOverride, null),
    finalUnitPrice: toNumberValue(data.finalUnitPrice, toNumberValue(data.suggestedUnitPrice, equipment.unitPricePHP)),
    isOverridden: toBoolValue(data.isOverridden, false),
    overrideReason: toStringValue(data.overrideReason, ''),
    overrideUpdatedAt: toNullableString(data.overrideUpdatedAt, null),
    equipment,
    createdAt: toStringValue(data.createdAt, nowIso()),
    updatedAt: toStringValue(data.updatedAt, nowIso()),
  };
}

function mapBoqItemRecord(id: string, data: Record<string, unknown>): BoqItemRecord {
  const quantity = toNumberValue(data.quantity, 0);
  const unitPrice = toNumberValue(data.unitPrice, 0);
  const totalPrice = toNumberValue(data.totalPrice, quantity * unitPrice);

  return {
    id,
    projectId: toStringValue(data.projectId, ''),
    section: toStringValue(data.section, ''),
    category: toStringValue(data.category, ''),
    description: toStringValue(data.description, ''),
    specification: toStringValue(data.specification, ''),
    quantity,
    unit: toStringValue(data.unit, 'pc'),
    suggestedUnitPrice: toNumberValue(data.suggestedUnitPrice, unitPrice),
    suggestedTotalPrice: toNumberValue(data.suggestedTotalPrice, totalPrice),
    userUnitPriceOverride: toNullableNumber(data.userUnitPriceOverride, null),
    userTotalPriceOverride: toNullableNumber(data.userTotalPriceOverride, null),
    finalUnitPrice: toNumberValue(data.finalUnitPrice, unitPrice),
    finalTotalPrice: toNumberValue(data.finalTotalPrice, totalPrice),
    unitPrice,
    totalPrice,
    sourceState: toStringValue(data.sourceState, 'suggested'),
    isOverridden: toBoolValue(data.isOverridden, false),
    overrideReason: toStringValue(data.overrideReason, ''),
    overrideUpdatedAt: toNullableString(data.overrideUpdatedAt, null),
    notes: toStringValue(data.notes, ''),
    createdAt: toStringValue(data.createdAt, nowIso()),
    updatedAt: toStringValue(data.updatedAt, nowIso()),
  };
}

async function deleteWhereFieldEquals(collectionName: string, field: string, value: string): Promise<void> {
  while (true) {
    const snapshot = await getFirebaseDb().collection(collectionName).where(field, '==', value).limit(400).get();
    if (snapshot.empty) return;

    const batch = getFirebaseDb().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    if (snapshot.size < 400) return;
  }
}

export async function listSelectedEquipmentForProject(projectId: string): Promise<SelectedEquipmentRecord[]> {
  const snapshot = await getFirebaseDb()
    .collection(COLLECTIONS.selectedEquipment)
    .where('projectId', '==', projectId)
    .get();

  return snapshot.docs.map((doc) => mapSelectedEquipmentRecord(doc.id, doc.data() as Record<string, unknown>));
}

export async function getSelectedEquipmentRecord(selectionId: string): Promise<SelectedEquipmentRecord | null> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.selectedEquipment).doc(selectionId).get();
  if (!snapshot.exists) return null;
  return mapSelectedEquipmentRecord(snapshot.id, snapshot.data() as Record<string, unknown>);
}

export async function createSelectedEquipmentRecord(input: {
  projectId: string;
  roomId: string;
  quantity: number;
  suggestedQuantity?: number;
  userQuantityOverride?: number | null;
  suggestedUnitPrice: number;
  userUnitPriceOverride?: number | null;
  finalUnitPrice?: number;
  isOverridden?: boolean;
  overrideReason?: string;
  overrideUpdatedAt?: string | null;
  equipment: EquipmentSpec;
}) {
  const id = randomUUID();
  const timestamp = nowIso();

  const record: SelectedEquipmentRecord = {
    id,
    projectId: input.projectId,
    roomId: input.roomId,
    quantity: Math.max(0, Math.trunc(input.quantity || 1)),
    suggestedQuantity: Math.max(0, Math.trunc(input.suggestedQuantity ?? input.quantity ?? 1)),
    userQuantityOverride: input.userQuantityOverride ?? null,
    suggestedUnitPrice: Math.max(0, input.suggestedUnitPrice || 0),
    userUnitPriceOverride: input.userUnitPriceOverride ?? null,
    finalUnitPrice: Math.max(0, input.finalUnitPrice ?? input.suggestedUnitPrice ?? 0),
    isOverridden: input.isOverridden ?? false,
    overrideReason: input.overrideReason ?? '',
    overrideUpdatedAt: input.overrideUpdatedAt ?? null,
    equipment: input.equipment,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await getFirebaseDb().collection(COLLECTIONS.selectedEquipment).doc(id).set(record);
  return record;
}

export async function updateSelectedEquipmentRecord(
  selectionId: string,
  updates: Partial<SelectedEquipmentRecord>,
): Promise<SelectedEquipmentRecord | null> {
  const existing = await getSelectedEquipmentRecord(selectionId);
  if (!existing) return null;

  const payload = {
    quantity: updates.quantity ?? existing.quantity,
    suggestedQuantity: updates.suggestedQuantity ?? existing.suggestedQuantity,
    userQuantityOverride: updates.userQuantityOverride !== undefined ? updates.userQuantityOverride : existing.userQuantityOverride,
    suggestedUnitPrice: updates.suggestedUnitPrice ?? existing.suggestedUnitPrice,
    userUnitPriceOverride: updates.userUnitPriceOverride !== undefined ? updates.userUnitPriceOverride : existing.userUnitPriceOverride,
    finalUnitPrice: updates.finalUnitPrice ?? existing.finalUnitPrice,
    isOverridden: updates.isOverridden ?? existing.isOverridden,
    overrideReason: updates.overrideReason ?? existing.overrideReason,
    overrideUpdatedAt: updates.overrideUpdatedAt !== undefined ? updates.overrideUpdatedAt : existing.overrideUpdatedAt,
    equipment: updates.equipment ?? existing.equipment,
    updatedAt: nowIso(),
  };

  await getFirebaseDb().collection(COLLECTIONS.selectedEquipment).doc(selectionId).set(payload, { merge: true });
  return getSelectedEquipmentRecord(selectionId);
}

export async function deleteSelectedEquipmentRecord(selectionId: string): Promise<void> {
  await getFirebaseDb().collection(COLLECTIONS.selectedEquipment).doc(selectionId).delete();
}

export async function clearSelectedEquipmentForProject(projectId: string): Promise<void> {
  await deleteWhereFieldEquals(COLLECTIONS.selectedEquipment, 'projectId', projectId);
}

export async function clearSelectedEquipmentForRoom(roomId: string): Promise<void> {
  await deleteWhereFieldEquals(COLLECTIONS.selectedEquipment, 'roomId', roomId);
}

export function toApiEquipment(record: SelectedEquipmentRecord) {
  const suggestedQuantity = record.suggestedQuantity > 0 ? record.suggestedQuantity : record.quantity;
  const quantity = record.userQuantityOverride ?? suggestedQuantity;
  const suggestedUnitPrice = record.suggestedUnitPrice || record.equipment.unitPricePHP;
  const finalUnitPrice =
    record.userUnitPriceOverride ??
    (record.finalUnitPrice > 0 ? record.finalUnitPrice : suggestedUnitPrice);

  return {
    id: record.id,
    roomId: record.roomId,
    brand: record.equipment.manufacturer,
    model: record.equipment.model,
    type: record.equipment.type,
    capacityTR: record.equipment.capacityTR,
    capacityBTU: record.equipment.capacityBTU,
    quantity,
    suggestedQuantity,
    userQuantityOverride: record.userQuantityOverride,
    suggestedUnitPrice,
    userUnitPriceOverride: record.userUnitPriceOverride,
    unitPrice: finalUnitPrice,
    totalPrice: finalUnitPrice * quantity,
    eer: record.equipment.eer,
    isInverter: record.equipment.eer >= INVERTER_EER_THRESHOLD,
    refrigerant: record.equipment.refrigerant,
    isOverridden: record.isOverridden,
    sourceState: record.isOverridden ? 'override' : 'suggested',
  };
}

export async function listBoqItemsForProject(projectId: string): Promise<BoqItemRecord[]> {
  const snapshot = await getFirebaseDb()
    .collection(COLLECTIONS.boqItems)
    .where('projectId', '==', projectId)
    .get();

  return snapshot.docs
    .map((doc) => mapBoqItemRecord(doc.id, doc.data() as Record<string, unknown>))
    .sort((a, b) => a.section.localeCompare(b.section));
}

export async function getBoqItemRecord(itemId: string): Promise<BoqItemRecord | null> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.boqItems).doc(itemId).get();
  if (!snapshot.exists) return null;
  return mapBoqItemRecord(snapshot.id, snapshot.data() as Record<string, unknown>);
}

export async function replaceBoqItemsForProject(
  projectId: string,
  items: Array<
    Omit<BoqItemRecord, 'id' | 'projectId' | 'createdAt' | 'updatedAt' | 'overrideUpdatedAt'> & {
      overrideUpdatedAt?: string | null;
    }
  >,
): Promise<BoqItemRecord[]> {
  await deleteWhereFieldEquals(COLLECTIONS.boqItems, 'projectId', projectId);

  const created: BoqItemRecord[] = [];
  const timestamp = nowIso();

  for (const item of items) {
    const id = randomUUID();
    const record: BoqItemRecord = {
      id,
      projectId,
      section: item.section,
      category: item.category,
      description: item.description,
      specification: item.specification,
      quantity: item.quantity,
      unit: item.unit,
      suggestedUnitPrice: item.suggestedUnitPrice,
      suggestedTotalPrice: item.suggestedTotalPrice,
      userUnitPriceOverride: item.userUnitPriceOverride,
      userTotalPriceOverride: item.userTotalPriceOverride,
      finalUnitPrice: item.finalUnitPrice,
      finalTotalPrice: item.finalTotalPrice,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      sourceState: item.sourceState,
      isOverridden: item.isOverridden,
      overrideReason: item.overrideReason,
      overrideUpdatedAt: item.overrideUpdatedAt ?? null,
      notes: item.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await getFirebaseDb().collection(COLLECTIONS.boqItems).doc(id).set(record);
    created.push(record);
  }

  return created;
}

export async function updateBoqItemRecord(
  itemId: string,
  updates: Partial<BoqItemRecord>,
): Promise<BoqItemRecord | null> {
  const existing = await getBoqItemRecord(itemId);
  if (!existing) return null;

  const payload = {
    description: updates.description ?? existing.description,
    specification: updates.specification ?? existing.specification,
    quantity: updates.quantity ?? existing.quantity,
    unit: updates.unit ?? existing.unit,
    suggestedUnitPrice: updates.suggestedUnitPrice ?? existing.suggestedUnitPrice,
    suggestedTotalPrice: updates.suggestedTotalPrice ?? existing.suggestedTotalPrice,
    userUnitPriceOverride: updates.userUnitPriceOverride !== undefined ? updates.userUnitPriceOverride : existing.userUnitPriceOverride,
    userTotalPriceOverride: updates.userTotalPriceOverride !== undefined ? updates.userTotalPriceOverride : existing.userTotalPriceOverride,
    finalUnitPrice: updates.finalUnitPrice ?? existing.finalUnitPrice,
    finalTotalPrice: updates.finalTotalPrice ?? existing.finalTotalPrice,
    unitPrice: updates.unitPrice ?? existing.unitPrice,
    totalPrice: updates.totalPrice ?? existing.totalPrice,
    sourceState: updates.sourceState ?? existing.sourceState,
    isOverridden: updates.isOverridden ?? existing.isOverridden,
    overrideReason: updates.overrideReason ?? existing.overrideReason,
    overrideUpdatedAt: updates.overrideUpdatedAt !== undefined ? updates.overrideUpdatedAt : existing.overrideUpdatedAt,
    notes: updates.notes ?? existing.notes,
    updatedAt: nowIso(),
  };

  await getFirebaseDb().collection(COLLECTIONS.boqItems).doc(itemId).set(payload, { merge: true });
  return getBoqItemRecord(itemId);
}

export async function deleteBoqItemRecord(itemId: string): Promise<void> {
  await getFirebaseDb().collection(COLLECTIONS.boqItems).doc(itemId).delete();
}
