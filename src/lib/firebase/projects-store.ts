import { randomUUID } from 'crypto';
import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { INVERTER_EER_THRESHOLD } from '@/lib/utils/constants';
import { getFirebaseDb } from '@/lib/firebase/server';
import {
  nowIso,
  toBooleanValue,
  toIntValue,
  toNullableNumberValue,
  toNullableStringValue,
  toNumberValue,
  toStringValue,
} from '@/lib/firebase/value-utils';

const COLLECTIONS = {
  projects: 'projects',
  floors: 'floors',
  rooms: 'rooms',
  selectedEquipment: 'selectedEquipment',
  boqItems: 'boqItems',
  auditLogs: 'auditLogs',
} as const;

type SortOrder = 'asc' | 'desc';

export interface FirebaseProjectRecord {
  id: string;
  name: string;
  createdBy: string;
  clientName: string;
  location: string;
  city: string;
  buildingType: string;
  status: string;
  outputClassification: string;
  totalFloorArea: number;
  floorsAboveGrade: number;
  floorsBelowGrade: number;
  outdoorDB: number;
  outdoorWB: number;
  outdoorRH: number;
  indoorDB: number;
  indoorRH: number;
  designConditions: string;
  safetyFactor: number;
  diversityFactor: number;
  notes: string;
  suggestedLaborMultiplier: number;
  laborMultiplierOverride: number | null;
  suggestedOverheadPercent: number;
  overheadPercentOverride: number | null;
  suggestedContingencyPercent: number;
  contingencyPercentOverride: number | null;
  suggestedVatRate: number;
  vatRateOverride: number | null;
  isEquipmentStale: boolean;
  isBoqStale: boolean;
  lastCoolingLoadAt: string | null;
  lastEquipmentSyncAt: string | null;
  lastBoqGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FirebaseFloorRecord {
  id: string;
  projectId: string;
  floorNumber: number;
  name: string;
  floorPlanImage: string | null;
  scale: number;
  ceilingHeight: number;
  createdAt: string;
  updatedAt: string;
}

export interface FirebaseRoomRecord {
  id: string;
  projectId: string;
  floorId: string;
  name: string;
  polygon: string;
  area: number;
  perimeter: number;
  spaceType: string;
  occupantCount: number;
  lightingDensity: number;
  equipmentLoad: number;
  wallConstruction: string;
  windowArea: number;
  windowOrientation: string;
  windowType: string;
  ceilingHeight: number;
  hasRoofExposure: boolean;
  notes: string;
  coolingLoad: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface FirebaseSelectedEquipmentRecord {
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
  equipment: {
    manufacturer: string;
    model: string;
    type: string;
    capacityTR: number;
    capacityBTU: number;
    unitPricePHP: number;
    eer: number;
    refrigerant: string;
  };
}

interface FirebaseBoqItemRecord {
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
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectListParams {
  status?: string | null;
  search?: string | null;
  sortBy?: string | null;
  sortOrder?: string | null;
}

export interface ProjectListItem extends FirebaseProjectRecord {
  floors: Array<
    FirebaseFloorRecord & {
      rooms: Array<FirebaseRoomRecord & { _count: { selectedEquipment: number } }>;
    }
  >;
  _count: {
    selectedEquipment: number;
    boqItems: number;
  };
}

export interface ProjectDetailItem extends FirebaseProjectRecord {
  floors: Array<FirebaseFloorRecord & { rooms: FirebaseRoomRecord[] }>;
  boqItems: Array<Record<string, unknown>>;
  selectedEquipment: Array<Record<string, unknown>>;
  pricingPolicy: {
    laborMultiplier: number;
    overheadPercent: number;
    contingencyPercent: number;
    vatRate: number;
  };
}

export interface FloorWithRooms extends FirebaseFloorRecord {
  rooms: Array<FirebaseRoomRecord & { selectedEquipment?: Array<Record<string, unknown>>; _count?: { selectedEquipment: number } }>;
}

interface AuditLogInput {
  projectId: string;
  action: string;
  entity: string;
  entityId: string;
  details?: string;
  previousValue?: string;
  newValue?: string;
}

const PROJECT_DEFAULTS = {
  clientName: '',
  location: 'Manila',
  city: 'Manila',
  buildingType: 'office',
  status: 'draft',
  outputClassification: 'preliminary',
  totalFloorArea: 0,
  floorsAboveGrade: 1,
  floorsBelowGrade: 0,
  outdoorDB: 35,
  outdoorWB: 28,
  outdoorRH: 50,
  indoorDB: 24,
  indoorRH: 50,
  designConditions: '{}',
  safetyFactor: 1.1,
  diversityFactor: 0.85,
  notes: '',
  suggestedLaborMultiplier: 0.35,
  laborMultiplierOverride: null,
  suggestedOverheadPercent: 0.15,
  overheadPercentOverride: null,
  suggestedContingencyPercent: 0.05,
  contingencyPercentOverride: null,
  suggestedVatRate: 0.12,
  vatRateOverride: null,
  isEquipmentStale: false,
  isBoqStale: false,
  lastCoolingLoadAt: null,
  lastEquipmentSyncAt: null,
  lastBoqGeneratedAt: null,
} as const;

const FLOOR_DEFAULTS = {
  floorNumber: 1,
  name: 'Ground Floor',
  floorPlanImage: null,
  scale: 50,
  ceilingHeight: 3.0,
} as const;

const ROOM_DEFAULTS = {
  name: 'Room',
  polygon: '[]',
  area: 0,
  perimeter: 0,
  spaceType: 'office',
  occupantCount: 2,
  lightingDensity: 15,
  equipmentLoad: 10,
  wallConstruction: 'concrete_150mm',
  windowArea: 0,
  windowOrientation: 'N',
  windowType: 'single_clear_6mm',
  ceilingHeight: 3.0,
  hasRoofExposure: false,
  notes: '',
  coolingLoad: null,
} as const;

function toIsoString(value: unknown, fallback: string | null = null): string | null {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return fallback;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

function mapProjectRecord(id: string, data: DocumentData): FirebaseProjectRecord {
  const createdAt = toIsoString(data.createdAt, nowIso()) ?? nowIso();
  const updatedAt = toIsoString(data.updatedAt, createdAt) ?? createdAt;

  return {
    id,
    name: toStringValue(data.name, ''),
    createdBy: toStringValue(data.createdBy, ''),
    clientName: toStringValue(data.clientName, PROJECT_DEFAULTS.clientName),
    location: toStringValue(data.location, PROJECT_DEFAULTS.location),
    city: toStringValue(data.city, PROJECT_DEFAULTS.city),
    buildingType: toStringValue(data.buildingType, PROJECT_DEFAULTS.buildingType),
    status: toStringValue(data.status, PROJECT_DEFAULTS.status),
    outputClassification: toStringValue(data.outputClassification, PROJECT_DEFAULTS.outputClassification),
    totalFloorArea: toNumberValue(data.totalFloorArea, PROJECT_DEFAULTS.totalFloorArea),
    floorsAboveGrade: toIntValue(data.floorsAboveGrade, PROJECT_DEFAULTS.floorsAboveGrade),
    floorsBelowGrade: toIntValue(data.floorsBelowGrade, PROJECT_DEFAULTS.floorsBelowGrade),
    outdoorDB: toNumberValue(data.outdoorDB, PROJECT_DEFAULTS.outdoorDB),
    outdoorWB: toNumberValue(data.outdoorWB, PROJECT_DEFAULTS.outdoorWB),
    outdoorRH: toNumberValue(data.outdoorRH, PROJECT_DEFAULTS.outdoorRH),
    indoorDB: toNumberValue(data.indoorDB, PROJECT_DEFAULTS.indoorDB),
    indoorRH: toNumberValue(data.indoorRH, PROJECT_DEFAULTS.indoorRH),
    designConditions: toStringValue(data.designConditions, PROJECT_DEFAULTS.designConditions),
    safetyFactor: toNumberValue(data.safetyFactor, PROJECT_DEFAULTS.safetyFactor),
    diversityFactor: toNumberValue(data.diversityFactor, PROJECT_DEFAULTS.diversityFactor),
    notes: toStringValue(data.notes, PROJECT_DEFAULTS.notes),
    suggestedLaborMultiplier: toNumberValue(data.suggestedLaborMultiplier, PROJECT_DEFAULTS.suggestedLaborMultiplier),
    laborMultiplierOverride: toNullableNumberValue(data.laborMultiplierOverride, PROJECT_DEFAULTS.laborMultiplierOverride),
    suggestedOverheadPercent: toNumberValue(data.suggestedOverheadPercent, PROJECT_DEFAULTS.suggestedOverheadPercent),
    overheadPercentOverride: toNullableNumberValue(data.overheadPercentOverride, PROJECT_DEFAULTS.overheadPercentOverride),
    suggestedContingencyPercent: toNumberValue(data.suggestedContingencyPercent, PROJECT_DEFAULTS.suggestedContingencyPercent),
    contingencyPercentOverride: toNullableNumberValue(data.contingencyPercentOverride, PROJECT_DEFAULTS.contingencyPercentOverride),
    suggestedVatRate: toNumberValue(data.suggestedVatRate, PROJECT_DEFAULTS.suggestedVatRate),
    vatRateOverride: toNullableNumberValue(data.vatRateOverride, PROJECT_DEFAULTS.vatRateOverride),
    isEquipmentStale: toBooleanValue(data.isEquipmentStale, PROJECT_DEFAULTS.isEquipmentStale),
    isBoqStale: toBooleanValue(data.isBoqStale, PROJECT_DEFAULTS.isBoqStale),
    lastCoolingLoadAt: toIsoString(data.lastCoolingLoadAt, PROJECT_DEFAULTS.lastCoolingLoadAt),
    lastEquipmentSyncAt: toIsoString(data.lastEquipmentSyncAt, PROJECT_DEFAULTS.lastEquipmentSyncAt),
    lastBoqGeneratedAt: toIsoString(data.lastBoqGeneratedAt, PROJECT_DEFAULTS.lastBoqGeneratedAt),
    createdAt,
    updatedAt,
  };
}

function mapFloorRecord(id: string, data: DocumentData): FirebaseFloorRecord {
  const createdAt = toIsoString(data.createdAt, nowIso()) ?? nowIso();
  const updatedAt = toIsoString(data.updatedAt, createdAt) ?? createdAt;

  return {
    id,
    projectId: toStringValue(data.projectId, ''),
    floorNumber: toIntValue(data.floorNumber, FLOOR_DEFAULTS.floorNumber),
    name: toStringValue(data.name, FLOOR_DEFAULTS.name),
    floorPlanImage: toNullableStringValue(data.floorPlanImage, FLOOR_DEFAULTS.floorPlanImage),
    scale: toNumberValue(data.scale, FLOOR_DEFAULTS.scale),
    ceilingHeight: toNumberValue(data.ceilingHeight, FLOOR_DEFAULTS.ceilingHeight),
    createdAt,
    updatedAt,
  };
}

function mapRoomRecord(id: string, data: DocumentData): FirebaseRoomRecord {
  const createdAt = toIsoString(data.createdAt, nowIso()) ?? nowIso();
  const updatedAt = toIsoString(data.updatedAt, createdAt) ?? createdAt;

  return {
    id,
    projectId: toStringValue(data.projectId, ''),
    floorId: toStringValue(data.floorId, ''),
    name: toStringValue(data.name, ROOM_DEFAULTS.name),
    polygon: toStringValue(data.polygon, ROOM_DEFAULTS.polygon),
    area: toNumberValue(data.area, ROOM_DEFAULTS.area),
    perimeter: toNumberValue(data.perimeter, ROOM_DEFAULTS.perimeter),
    spaceType: toStringValue(data.spaceType, ROOM_DEFAULTS.spaceType),
    occupantCount: toIntValue(data.occupantCount, ROOM_DEFAULTS.occupantCount),
    lightingDensity: toNumberValue(data.lightingDensity, ROOM_DEFAULTS.lightingDensity),
    equipmentLoad: toNumberValue(data.equipmentLoad, ROOM_DEFAULTS.equipmentLoad),
    wallConstruction: toStringValue(data.wallConstruction, ROOM_DEFAULTS.wallConstruction),
    windowArea: toNumberValue(data.windowArea, ROOM_DEFAULTS.windowArea),
    windowOrientation: toStringValue(data.windowOrientation, ROOM_DEFAULTS.windowOrientation),
    windowType: toStringValue(data.windowType, ROOM_DEFAULTS.windowType),
    ceilingHeight: toNumberValue(data.ceilingHeight, ROOM_DEFAULTS.ceilingHeight),
    hasRoofExposure: toBooleanValue(data.hasRoofExposure, ROOM_DEFAULTS.hasRoofExposure),
    notes: toStringValue(data.notes, ROOM_DEFAULTS.notes),
    coolingLoad:
      data.coolingLoad && typeof data.coolingLoad === 'object'
        ? (data.coolingLoad as Record<string, unknown>)
        : ROOM_DEFAULTS.coolingLoad,
    createdAt,
    updatedAt,
  };
}

function mapSelectedEquipmentRecord(id: string, data: DocumentData): FirebaseSelectedEquipmentRecord {
  const equipmentSource = data.equipment && typeof data.equipment === 'object'
    ? (data.equipment as Record<string, unknown>)
    : {};

  return {
    id,
    projectId: toStringValue(data.projectId, ''),
    roomId: toStringValue(data.roomId, ''),
    quantity: Math.max(0, toIntValue(data.quantity, 1)),
    suggestedQuantity: Math.max(0, toIntValue(data.suggestedQuantity, toIntValue(data.quantity, 1))),
    userQuantityOverride: toNullableNumberValue(data.userQuantityOverride, null),
    suggestedUnitPrice: Math.max(0, toNumberValue(data.suggestedUnitPrice, toNumberValue(equipmentSource.unitPricePHP, 0))),
    userUnitPriceOverride: toNullableNumberValue(data.userUnitPriceOverride, null),
    finalUnitPrice: Math.max(0, toNumberValue(data.finalUnitPrice, toNumberValue(data.suggestedUnitPrice, toNumberValue(equipmentSource.unitPricePHP, 0)))),
    isOverridden: toBooleanValue(data.isOverridden, false),
    equipment: {
      manufacturer: toStringValue(equipmentSource.manufacturer, toStringValue(data.brand, '')),
      model: toStringValue(equipmentSource.model, toStringValue(data.model, '')),
      type: toStringValue(equipmentSource.type, toStringValue(data.type, '')),
      capacityTR: toNumberValue(equipmentSource.capacityTR, toNumberValue(data.capacityTR, 0)),
      capacityBTU: toNumberValue(equipmentSource.capacityBTU, toNumberValue(data.capacityBTU, 0)),
      unitPricePHP: toNumberValue(equipmentSource.unitPricePHP, toNumberValue(data.unitPrice, 0)),
      eer: toNumberValue(equipmentSource.eer, toNumberValue(data.eer, 10)),
      refrigerant: toStringValue(equipmentSource.refrigerant, toStringValue(data.refrigerant, 'R32')),
    },
  };
}

function mapBoqItemRecord(id: string, data: DocumentData): FirebaseBoqItemRecord {
  const createdAt = toIsoString(data.createdAt, nowIso()) ?? nowIso();
  const updatedAt = toIsoString(data.updatedAt, createdAt) ?? createdAt;

  return {
    id,
    projectId: toStringValue(data.projectId, ''),
    section: toStringValue(data.section, ''),
    category: toStringValue(data.category, ''),
    description: toStringValue(data.description, ''),
    specification: toStringValue(data.specification, ''),
    quantity: toNumberValue(data.quantity, 0),
    unit: toStringValue(data.unit, 'pc'),
    suggestedUnitPrice: toNumberValue(data.suggestedUnitPrice, toNumberValue(data.unitPrice, 0)),
    suggestedTotalPrice: toNumberValue(data.suggestedTotalPrice, toNumberValue(data.totalPrice, 0)),
    userUnitPriceOverride: toNullableNumberValue(data.userUnitPriceOverride, null),
    userTotalPriceOverride: toNullableNumberValue(data.userTotalPriceOverride, null),
    finalUnitPrice: toNumberValue(data.finalUnitPrice, toNumberValue(data.unitPrice, 0)),
    finalTotalPrice: toNumberValue(data.finalTotalPrice, toNumberValue(data.totalPrice, 0)),
    unitPrice: toNumberValue(data.unitPrice, toNumberValue(data.finalUnitPrice, 0)),
    totalPrice: toNumberValue(data.totalPrice, toNumberValue(data.finalTotalPrice, 0)),
    sourceState: toStringValue(data.sourceState, 'suggested'),
    isOverridden: toBooleanValue(data.isOverridden, false),
    overrideReason: toStringValue(data.overrideReason, ''),
    notes: toStringValue(data.notes, ''),
    createdAt,
    updatedAt,
  };
}

async function listAllProjects(): Promise<FirebaseProjectRecord[]> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.projects).get();
  return snapshot.docs.map((doc) => mapProjectRecord(doc.id, doc.data()));
}

async function listProjectFloors(projectId: string): Promise<FirebaseFloorRecord[]> {
  const snapshot = await getFirebaseDb()
    .collection(COLLECTIONS.floors)
    .where('projectId', '==', projectId)
    .get();

  return snapshot.docs
    .map((doc) => mapFloorRecord(doc.id, doc.data()))
    .sort((a, b) => a.floorNumber - b.floorNumber);
}

async function listProjectRooms(projectId: string): Promise<FirebaseRoomRecord[]> {
  const snapshot = await getFirebaseDb()
    .collection(COLLECTIONS.rooms)
    .where('projectId', '==', projectId)
    .get();

  return snapshot.docs
    .map((doc) => mapRoomRecord(doc.id, doc.data()))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function listProjectSelectedEquipment(projectId: string): Promise<FirebaseSelectedEquipmentRecord[]> {
  const snapshot = await getFirebaseDb()
    .collection(COLLECTIONS.selectedEquipment)
    .where('projectId', '==', projectId)
    .get();

  return snapshot.docs.map((doc) => mapSelectedEquipmentRecord(doc.id, doc.data()));
}

async function listProjectBoqItems(projectId: string): Promise<FirebaseBoqItemRecord[]> {
  const snapshot = await getFirebaseDb()
    .collection(COLLECTIONS.boqItems)
    .where('projectId', '==', projectId)
    .get();

  return snapshot.docs
    .map((doc) => mapBoqItemRecord(doc.id, doc.data()))
    .sort((a, b) => a.section.localeCompare(b.section));
}

function resolvePricingValue(suggested: number, override: number | null): number {
  return override ?? suggested;
}

function composeFloorsWithRooms(
  floors: FirebaseFloorRecord[],
  rooms: FirebaseRoomRecord[],
  selectedEquipment: FirebaseSelectedEquipmentRecord[] = [],
  includeRoomEquipment: boolean,
  includeRoomEquipmentCount: boolean,
): FloorWithRooms[] {
  const roomsByFloor = new Map<string, FirebaseRoomRecord[]>();
  for (const room of rooms) {
    const existing = roomsByFloor.get(room.floorId);
    if (existing) {
      existing.push(room);
    } else {
      roomsByFloor.set(room.floorId, [room]);
    }
  }

  const equipmentByRoom = new Map<string, FirebaseSelectedEquipmentRecord[]>();
  for (const selection of selectedEquipment) {
    const existing = equipmentByRoom.get(selection.roomId);
    if (existing) {
      existing.push(selection);
    } else {
      equipmentByRoom.set(selection.roomId, [selection]);
    }
  }

  return floors.map((floor) => ({
    ...floor,
    rooms: (roomsByFloor.get(floor.id) || []).map((room) => {
      const roomSelections = equipmentByRoom.get(room.id) || [];
      const mappedSelections = roomSelections.map((sel) => {
        const suggestedQuantity = sel.suggestedQuantity > 0 ? sel.suggestedQuantity : sel.quantity;
        const quantity = sel.userQuantityOverride ?? suggestedQuantity;
        const suggestedUnitPrice =
          sel.suggestedUnitPrice > 0 ? sel.suggestedUnitPrice : sel.equipment.unitPricePHP;
        const finalUnitPrice =
          sel.userUnitPriceOverride ??
          (sel.finalUnitPrice > 0 ? sel.finalUnitPrice : suggestedUnitPrice);

        return {
          id: sel.id,
          roomId: sel.roomId,
          brand: sel.equipment.manufacturer,
          model: sel.equipment.model,
          type: sel.equipment.type,
          capacityTR: sel.equipment.capacityTR,
          capacityBTU: sel.equipment.capacityBTU,
          quantity,
          suggestedQuantity,
          userQuantityOverride: sel.userQuantityOverride,
          suggestedUnitPrice,
          userUnitPriceOverride: sel.userUnitPriceOverride,
          unitPrice: finalUnitPrice,
          totalPrice: finalUnitPrice * quantity,
          eer: sel.equipment.eer,
          isInverter: sel.equipment.eer >= INVERTER_EER_THRESHOLD,
          refrigerant: sel.equipment.refrigerant,
          isOverridden: sel.isOverridden,
          sourceState: sel.isOverridden ? 'override' : 'suggested',
        };
      });

      const roomWithMeta: FirebaseRoomRecord & {
        selectedEquipment?: Array<Record<string, unknown>>;
        _count?: { selectedEquipment: number };
      } = { ...room };

      if (includeRoomEquipment) {
        roomWithMeta.selectedEquipment = mappedSelections;
      }

      if (includeRoomEquipmentCount) {
        roomWithMeta._count = { selectedEquipment: mappedSelections.length };
      }

      return roomWithMeta;
    }),
  }));
}

function mapBoqItemsForDetail(items: FirebaseBoqItemRecord[]): Array<Record<string, unknown>> {
  return items.map((item) => {
    const suggestedUnitPrice = item.suggestedUnitPrice > 0 ? item.suggestedUnitPrice : item.unitPrice;
    const finalUnitPrice = item.finalUnitPrice > 0 ? item.finalUnitPrice : item.unitPrice;
    const suggestedTotalPrice = item.suggestedTotalPrice > 0 ? item.suggestedTotalPrice : suggestedUnitPrice * item.quantity;
    const finalTotalPrice = item.finalTotalPrice > 0 ? item.finalTotalPrice : finalUnitPrice * item.quantity;

    return {
      ...item,
      suggestedUnitPrice,
      suggestedTotalPrice,
      finalUnitPrice,
      finalTotalPrice,
      unitPrice: finalUnitPrice,
      totalPrice: finalTotalPrice,
      sourceState: item.isOverridden ? 'override' : 'suggested',
    };
  });
}

function mapSelectedEquipmentForDetail(
  selections: FirebaseSelectedEquipmentRecord[],
): Array<Record<string, unknown>> {
  return selections.map((sel) => {
    const suggestedQuantity = sel.suggestedQuantity > 0 ? sel.suggestedQuantity : sel.quantity;
    const quantity = sel.userQuantityOverride ?? suggestedQuantity;
    const suggestedUnitPrice =
      sel.suggestedUnitPrice > 0 ? sel.suggestedUnitPrice : sel.equipment.unitPricePHP;
    const finalUnitPrice =
      sel.userUnitPriceOverride ??
      (sel.finalUnitPrice > 0 ? sel.finalUnitPrice : suggestedUnitPrice);

    return {
      id: sel.id,
      roomId: sel.roomId,
      brand: sel.equipment.manufacturer,
      model: sel.equipment.model,
      type: sel.equipment.type,
      capacityTR: sel.equipment.capacityTR,
      capacityBTU: sel.equipment.capacityBTU,
      quantity,
      suggestedQuantity,
      userQuantityOverride: sel.userQuantityOverride,
      suggestedUnitPrice,
      userUnitPriceOverride: sel.userUnitPriceOverride,
      unitPrice: finalUnitPrice,
      totalPrice: finalUnitPrice * quantity,
      eer: sel.equipment.eer,
      isInverter: sel.equipment.eer >= INVERTER_EER_THRESHOLD,
      refrigerant: sel.equipment.refrigerant,
      isOverridden: sel.isOverridden,
      sourceState: sel.isOverridden ? 'override' : 'suggested',
    };
  });
}

export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  const payload = stripUndefined({
    id: randomUUID(),
    projectId: input.projectId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    details: input.details,
    previousValue: input.previousValue,
    newValue: input.newValue,
    createdAt: nowIso(),
  });

  await getFirebaseDb().collection(COLLECTIONS.auditLogs).doc(String(payload.id)).set(payload);
}

export async function getProjectRecord(id: string): Promise<FirebaseProjectRecord | null> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.projects).doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  return mapProjectRecord(snapshot.id, snapshot.data() || {});
}

export async function createProjectRecord(
  input: Partial<FirebaseProjectRecord>,
): Promise<FirebaseProjectRecord> {
  const id = input.id || randomUUID();
  const createdAt = nowIso();

  const project: FirebaseProjectRecord = {
    id,
    name: toStringValue(input.name, ''),
    createdBy: toStringValue(input.createdBy, ''),
    clientName: toStringValue(input.clientName, PROJECT_DEFAULTS.clientName),
    location: toStringValue(input.location, PROJECT_DEFAULTS.location),
    city: toStringValue(input.city, PROJECT_DEFAULTS.city),
    buildingType: toStringValue(input.buildingType, PROJECT_DEFAULTS.buildingType),
    status: toStringValue(input.status, PROJECT_DEFAULTS.status),
    outputClassification: toStringValue(input.outputClassification, PROJECT_DEFAULTS.outputClassification),
    totalFloorArea: toNumberValue(input.totalFloorArea, PROJECT_DEFAULTS.totalFloorArea),
    floorsAboveGrade: toIntValue(input.floorsAboveGrade, PROJECT_DEFAULTS.floorsAboveGrade),
    floorsBelowGrade: toIntValue(input.floorsBelowGrade, PROJECT_DEFAULTS.floorsBelowGrade),
    outdoorDB: toNumberValue(input.outdoorDB, PROJECT_DEFAULTS.outdoorDB),
    outdoorWB: toNumberValue(input.outdoorWB, PROJECT_DEFAULTS.outdoorWB),
    outdoorRH: toNumberValue(input.outdoorRH, PROJECT_DEFAULTS.outdoorRH),
    indoorDB: toNumberValue(input.indoorDB, PROJECT_DEFAULTS.indoorDB),
    indoorRH: toNumberValue(input.indoorRH, PROJECT_DEFAULTS.indoorRH),
    designConditions: toStringValue(input.designConditions, PROJECT_DEFAULTS.designConditions),
    safetyFactor: toNumberValue(input.safetyFactor, PROJECT_DEFAULTS.safetyFactor),
    diversityFactor: toNumberValue(input.diversityFactor, PROJECT_DEFAULTS.diversityFactor),
    notes: toStringValue(input.notes, PROJECT_DEFAULTS.notes),
    suggestedLaborMultiplier: toNumberValue(
      input.suggestedLaborMultiplier,
      PROJECT_DEFAULTS.suggestedLaborMultiplier,
    ),
    laborMultiplierOverride: toNullableNumberValue(
      input.laborMultiplierOverride,
      PROJECT_DEFAULTS.laborMultiplierOverride,
    ),
    suggestedOverheadPercent: toNumberValue(
      input.suggestedOverheadPercent,
      PROJECT_DEFAULTS.suggestedOverheadPercent,
    ),
    overheadPercentOverride: toNullableNumberValue(
      input.overheadPercentOverride,
      PROJECT_DEFAULTS.overheadPercentOverride,
    ),
    suggestedContingencyPercent: toNumberValue(
      input.suggestedContingencyPercent,
      PROJECT_DEFAULTS.suggestedContingencyPercent,
    ),
    contingencyPercentOverride: toNullableNumberValue(
      input.contingencyPercentOverride,
      PROJECT_DEFAULTS.contingencyPercentOverride,
    ),
    suggestedVatRate: toNumberValue(input.suggestedVatRate, PROJECT_DEFAULTS.suggestedVatRate),
    vatRateOverride: toNullableNumberValue(input.vatRateOverride, PROJECT_DEFAULTS.vatRateOverride),
    isEquipmentStale: toBooleanValue(input.isEquipmentStale, PROJECT_DEFAULTS.isEquipmentStale),
    isBoqStale: toBooleanValue(input.isBoqStale, PROJECT_DEFAULTS.isBoqStale),
    lastCoolingLoadAt: toIsoString(input.lastCoolingLoadAt, PROJECT_DEFAULTS.lastCoolingLoadAt),
    lastEquipmentSyncAt: toIsoString(input.lastEquipmentSyncAt, PROJECT_DEFAULTS.lastEquipmentSyncAt),
    lastBoqGeneratedAt: toIsoString(input.lastBoqGeneratedAt, PROJECT_DEFAULTS.lastBoqGeneratedAt),
    createdAt,
    updatedAt: createdAt,
  };

  await getFirebaseDb().collection(COLLECTIONS.projects).doc(id).set(project);
  return project;
}

export async function updateProjectRecord(
  id: string,
  updates: Partial<FirebaseProjectRecord>,
): Promise<void> {
  const payload = stripUndefined({ ...updates, id: undefined, updatedAt: nowIso() });
  await getFirebaseDb().collection(COLLECTIONS.projects).doc(id).set(payload, { merge: true });
}

export async function listProjectsForApi(params: ProjectListParams): Promise<ProjectListItem[]> {
  const projects = await listAllProjects();

  let filtered = projects;
  if (params.status && params.status !== 'all') {
    filtered = filtered.filter((project) => project.status === params.status);
  } else {
    filtered = filtered.filter((project) => project.status !== 'archived' && project.status !== 'deleted');
  }

  if (params.search) {
    const needle = params.search.toLowerCase();
    filtered = filtered.filter((project) =>
      [project.name, project.clientName, project.buildingType, project.location]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }

  const sortBy = params.sortBy === 'name' || params.sortBy === 'createdAt' || params.sortBy === 'updatedAt'
    ? params.sortBy
    : 'updatedAt';
  const sortOrder: SortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';

  filtered = filtered.sort((a, b) => {
    let left: string | number = a[sortBy as keyof FirebaseProjectRecord] as string | number;
    let right: string | number = b[sortBy as keyof FirebaseProjectRecord] as string | number;

    if (sortBy === 'createdAt' || sortBy === 'updatedAt') {
      left = new Date(String(left)).getTime();
      right = new Date(String(right)).getTime();
    }

    if (left < right) {
      return sortOrder === 'asc' ? -1 : 1;
    }
    if (left > right) {
      return sortOrder === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const hydrated = await Promise.all(
    filtered.map(async (project) => {
      const [floors, rooms, selectedEquipment, boqItems] = await Promise.all([
        listProjectFloors(project.id),
        listProjectRooms(project.id),
        listProjectSelectedEquipment(project.id),
        listProjectBoqItems(project.id),
      ]);

      const floorsWithRooms = composeFloorsWithRooms(
        floors,
        rooms,
        selectedEquipment,
        false,
        true,
      ) as Array<FirebaseFloorRecord & { rooms: Array<FirebaseRoomRecord & { _count: { selectedEquipment: number } }> }>;

      return {
        ...project,
        floors: floorsWithRooms,
        _count: {
          selectedEquipment: selectedEquipment.length,
          boqItems: boqItems.length,
        },
      };
    }),
  );

  return hydrated;
}

export async function getProjectWithDetails(id: string): Promise<ProjectDetailItem | null> {
  const project = await getProjectRecord(id);
  if (!project) {
    return null;
  }

  const [floors, rooms, selectedEquipment, boqItems] = await Promise.all([
    listProjectFloors(id),
    listProjectRooms(id),
    listProjectSelectedEquipment(id),
    listProjectBoqItems(id),
  ]);

  return {
    ...project,
    floors: composeFloorsWithRooms(floors, rooms, selectedEquipment, false, false),
    boqItems: mapBoqItemsForDetail(boqItems),
    selectedEquipment: mapSelectedEquipmentForDetail(selectedEquipment),
    pricingPolicy: {
      laborMultiplier: resolvePricingValue(project.suggestedLaborMultiplier, project.laborMultiplierOverride),
      overheadPercent: resolvePricingValue(project.suggestedOverheadPercent, project.overheadPercentOverride),
      contingencyPercent: resolvePricingValue(project.suggestedContingencyPercent, project.contingencyPercentOverride),
      vatRate: resolvePricingValue(project.suggestedVatRate, project.vatRateOverride),
    },
  };
}

export async function getProjectWithFloorsOnly(id: string): Promise<(FirebaseProjectRecord & { floors: FloorWithRooms[] }) | null> {
  const project = await getProjectRecord(id);
  if (!project) {
    return null;
  }

  const [floors, rooms] = await Promise.all([listProjectFloors(id), listProjectRooms(id)]);

  return {
    ...project,
    floors: composeFloorsWithRooms(floors, rooms, [], false, false),
  };
}

async function deleteWhereFieldEquals(
  collectionName: string,
  field: string,
  value: string,
): Promise<void> {
  while (true) {
    const snapshot = await getFirebaseDb()
      .collection(collectionName)
      .where(field, '==', value)
      .limit(400)
      .get();

    if (snapshot.empty) {
      return;
    }

    const batch = getFirebaseDb().batch();
    snapshot.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    if (snapshot.size < 400) {
      return;
    }
  }
}

export async function deleteProjectRecordPermanently(id: string): Promise<void> {
  await Promise.all([
    deleteWhereFieldEquals(COLLECTIONS.floors, 'projectId', id),
    deleteWhereFieldEquals(COLLECTIONS.rooms, 'projectId', id),
    deleteWhereFieldEquals(COLLECTIONS.selectedEquipment, 'projectId', id),
    deleteWhereFieldEquals(COLLECTIONS.boqItems, 'projectId', id),
    deleteWhereFieldEquals(COLLECTIONS.auditLogs, 'projectId', id),
  ]);

  await getFirebaseDb().collection(COLLECTIONS.projects).doc(id).delete();
}

export async function getFloorsWithRooms(
  projectId: string,
  options?: {
    includeRoomEquipment?: boolean;
    includeRoomEquipmentCount?: boolean;
  },
): Promise<FloorWithRooms[]> {
  const includeRoomEquipment = options?.includeRoomEquipment === true;
  const includeRoomEquipmentCount = options?.includeRoomEquipmentCount === true;

  const [floors, rooms, selections] = await Promise.all([
    listProjectFloors(projectId),
    listProjectRooms(projectId),
    includeRoomEquipment || includeRoomEquipmentCount
      ? listProjectSelectedEquipment(projectId)
      : Promise.resolve([]),
  ]);

  return composeFloorsWithRooms(
    floors,
    rooms,
    selections,
    includeRoomEquipment,
    includeRoomEquipmentCount,
  );
}

export async function createFloorRecord(
  projectId: string,
  input: Partial<FirebaseFloorRecord>,
): Promise<FirebaseFloorRecord> {
  const id = randomUUID();
  const createdAt = nowIso();

  const floor: FirebaseFloorRecord = {
    id,
    projectId,
    floorNumber: toIntValue(input.floorNumber, FLOOR_DEFAULTS.floorNumber),
    name: toStringValue(input.name, `Floor ${toIntValue(input.floorNumber, FLOOR_DEFAULTS.floorNumber)}`),
    floorPlanImage: toNullableStringValue(input.floorPlanImage, FLOOR_DEFAULTS.floorPlanImage),
    scale: toNumberValue(input.scale, FLOOR_DEFAULTS.scale),
    ceilingHeight: toNumberValue(input.ceilingHeight, FLOOR_DEFAULTS.ceilingHeight),
    createdAt,
    updatedAt: createdAt,
  };

  await getFirebaseDb().collection(COLLECTIONS.floors).doc(id).set(floor);
  return floor;
}

export async function getFloorRecord(id: string): Promise<FirebaseFloorRecord | null> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.floors).doc(id).get();
  if (!snapshot.exists) {
    return null;
  }

  return mapFloorRecord(snapshot.id, snapshot.data() || {});
}

export async function findFloorByProjectAndNumber(
  projectId: string,
  floorNumber: number,
): Promise<FirebaseFloorRecord | null> {
  const floors = await listProjectFloors(projectId);
  return floors.find((floor) => floor.floorNumber === floorNumber) || null;
}

export async function updateFloorRecord(
  floorId: string,
  updates: Partial<FirebaseFloorRecord>,
): Promise<void> {
  const payload = stripUndefined({ ...updates, id: undefined, projectId: undefined, updatedAt: nowIso() });
  await getFirebaseDb().collection(COLLECTIONS.floors).doc(floorId).set(payload, { merge: true });
}

export async function deleteFloorRecord(floorId: string): Promise<void> {
  const roomSnapshot = await getFirebaseDb()
    .collection(COLLECTIONS.rooms)
    .where('floorId', '==', floorId)
    .get();

  for (const roomDoc of roomSnapshot.docs) {
    await deleteWhereFieldEquals(COLLECTIONS.selectedEquipment, 'roomId', roomDoc.id);
    await roomDoc.ref.delete();
  }

  await getFirebaseDb().collection(COLLECTIONS.floors).doc(floorId).delete();
}

export async function getRoomRecord(roomId: string): Promise<FirebaseRoomRecord | null> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.rooms).doc(roomId).get();
  if (!snapshot.exists) {
    return null;
  }

  return mapRoomRecord(snapshot.id, snapshot.data() || {});
}

export async function createRoomRecord(
  projectId: string,
  floorId: string,
  input: Partial<FirebaseRoomRecord>,
): Promise<FirebaseRoomRecord> {
  const id = randomUUID();
  const createdAt = nowIso();

  const room: FirebaseRoomRecord = {
    id,
    projectId,
    floorId,
    name: toStringValue(input.name, ROOM_DEFAULTS.name),
    polygon: toStringValue(input.polygon, ROOM_DEFAULTS.polygon),
    area: toNumberValue(input.area, ROOM_DEFAULTS.area),
    perimeter: toNumberValue(input.perimeter, ROOM_DEFAULTS.perimeter),
    spaceType: toStringValue(input.spaceType, ROOM_DEFAULTS.spaceType),
    occupantCount: toIntValue(input.occupantCount, ROOM_DEFAULTS.occupantCount),
    lightingDensity: toNumberValue(input.lightingDensity, ROOM_DEFAULTS.lightingDensity),
    equipmentLoad: toNumberValue(input.equipmentLoad, ROOM_DEFAULTS.equipmentLoad),
    wallConstruction: toStringValue(input.wallConstruction, ROOM_DEFAULTS.wallConstruction),
    windowArea: toNumberValue(input.windowArea, ROOM_DEFAULTS.windowArea),
    windowOrientation: toStringValue(input.windowOrientation, ROOM_DEFAULTS.windowOrientation),
    windowType: toStringValue(input.windowType, ROOM_DEFAULTS.windowType),
    ceilingHeight: toNumberValue(input.ceilingHeight, ROOM_DEFAULTS.ceilingHeight),
    hasRoofExposure: toBooleanValue(input.hasRoofExposure, ROOM_DEFAULTS.hasRoofExposure),
    notes: toStringValue(input.notes, ROOM_DEFAULTS.notes),
    coolingLoad:
      input.coolingLoad && typeof input.coolingLoad === 'object'
        ? (input.coolingLoad as Record<string, unknown>)
        : ROOM_DEFAULTS.coolingLoad,
    createdAt,
    updatedAt: createdAt,
  };

  await getFirebaseDb().collection(COLLECTIONS.rooms).doc(id).set(room);
  return room;
}

export async function updateRoomRecord(
  roomId: string,
  updates: Partial<FirebaseRoomRecord>,
): Promise<void> {
  const payload = stripUndefined({
    ...updates,
    id: undefined,
    projectId: undefined,
    floorId: undefined,
    updatedAt: nowIso(),
  });
  await getFirebaseDb().collection(COLLECTIONS.rooms).doc(roomId).set(payload, { merge: true });
}

export async function deleteRoomRecord(roomId: string): Promise<void> {
  await deleteWhereFieldEquals(COLLECTIONS.selectedEquipment, 'roomId', roomId);
  await getFirebaseDb().collection(COLLECTIONS.rooms).doc(roomId).delete();
}

export async function setRoomCoolingLoad(
  roomId: string,
  coolingLoad: Record<string, unknown>,
): Promise<void> {
  await updateRoomRecord(roomId, { coolingLoad });
}
