import { randomUUID } from 'crypto';
import { getFirebaseDb } from '@/lib/firebase/server';
import {
  nowIso,
  toIntValue,
  toNullableStringValue as toNullableString,
  toNumberValue,
  toStringValue,
} from '@/lib/firebase/value-utils';

const COLLECTIONS = {
  settings: 'appSettings',
  materials: 'materials',
  suppliers: 'suppliers',
  diagnosticHistory: 'diagnosticHistory',
} as const;

const GLOBAL_SETTINGS_ID = 'global';

export interface SupplierRecord {
  id: string;
  name: string;
  type: string;
  website: string;
  location: string;
  contactInfo: string;
  coverageArea: string;
  categories: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialRecord {
  id: string;
  category: string;
  name: string;
  specification: string;
  unit: string;
  unitPricePHP: number;
  supplierId: string | null;
  lastUpdated: string;
  createdAt: string;
  updatedAt: string;
}

interface DiagnosticHistoryRecord {
  id: string;
  userId: string;
  userEmail: string;
  systemType: string;
  input: string;
  result: string;
  faultCount: number;
  maxSeverity: string;
  createdAt: string;
}

function mapSupplierRecord(id: string, data: Record<string, unknown>): SupplierRecord {
  const createdAt = toStringValue(data.createdAt, nowIso());
  const updatedAt = toStringValue(data.updatedAt, createdAt);
  return {
    id,
    name: toStringValue(data.name, 'New Supplier'),
    type: toStringValue(data.type, 'local'),
    website: toStringValue(data.website, ''),
    location: toStringValue(data.location, ''),
    contactInfo: toStringValue(data.contactInfo, ''),
    coverageArea: toStringValue(data.coverageArea, ''),
    categories: toStringValue(data.categories, '[]'),
    createdAt,
    updatedAt,
  };
}

function mapMaterialRecord(id: string, data: Record<string, unknown>): MaterialRecord {
  const createdAt = toStringValue(data.createdAt, nowIso());
  const updatedAt = toStringValue(data.updatedAt, createdAt);
  return {
    id,
    category: toStringValue(data.category, 'misc'),
    name: toStringValue(data.name, 'New Material'),
    specification: toStringValue(data.specification, ''),
    unit: toStringValue(data.unit, 'pc'),
    unitPricePHP: toNumberValue(data.unitPricePHP, 0),
    supplierId: toNullableString(data.supplierId, null),
    lastUpdated: toStringValue(data.lastUpdated, updatedAt),
    createdAt,
    updatedAt,
  };
}

function mapDiagnosticHistoryRecord(id: string, data: Record<string, unknown>): DiagnosticHistoryRecord {
  return {
    id,
    userId: toStringValue(data.userId, ''),
    userEmail: toStringValue(data.userEmail, ''),
    systemType: toStringValue(data.systemType, ''),
    input: toStringValue(data.input, '{}'),
    result: toStringValue(data.result, '{}'),
    faultCount: toIntValue(data.faultCount, 0),
    maxSeverity: toStringValue(data.maxSeverity, 'info'),
    createdAt: toStringValue(data.createdAt, nowIso()),
  };
}

async function listAllSuppliers(): Promise<SupplierRecord[]> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.suppliers).get();
  return snapshot.docs.map((doc) => mapSupplierRecord(doc.id, doc.data() as Record<string, unknown>));
}

async function listAllMaterials(): Promise<MaterialRecord[]> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.materials).get();
  return snapshot.docs.map((doc) => mapMaterialRecord(doc.id, doc.data() as Record<string, unknown>));
}

export async function getMergedSettings<T extends Record<string, unknown>>(defaults: T): Promise<T> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.settings).doc(GLOBAL_SETTINGS_ID).get();
  if (!snapshot.exists) {
    return defaults;
  }

  const raw = snapshot.data() as Record<string, unknown>;
  const fromSettings = raw.settings && typeof raw.settings === 'object' ? (raw.settings as Record<string, unknown>) : {};

  if (typeof raw.data === 'string') {
    try {
      const parsed = JSON.parse(raw.data) as Record<string, unknown>;
      return { ...defaults, ...parsed, ...fromSettings } as T;
    } catch {
      return { ...defaults, ...fromSettings } as T;
    }
  }

  return { ...defaults, ...fromSettings } as T;
}

export async function upsertSettings<T extends Record<string, unknown>>(
  defaults: T,
  updates: Partial<T>,
): Promise<T> {
  const current = await getMergedSettings(defaults);
  const merged = { ...current, ...updates } as T;

  await getFirebaseDb().collection(COLLECTIONS.settings).doc(GLOBAL_SETTINGS_ID).set(
    {
      settings: merged,
      updatedAt: nowIso(),
    },
    { merge: true },
  );

  return merged;
}

export async function listSuppliersForApi(params: {
  type?: string | null;
  search?: string | null;
}) {
  const [allSuppliers, allMaterials] = await Promise.all([listAllSuppliers(), listAllMaterials()]);
  const types = [...new Set(allSuppliers.map((supplier) => supplier.type))].sort();

  let filtered = allSuppliers;
  if (params.type) {
    filtered = filtered.filter((supplier) => supplier.type === params.type);
  }

  if (params.search) {
    const needle = params.search.toLowerCase();
    filtered = filtered.filter((supplier) =>
      `${supplier.name} ${supplier.location}`.toLowerCase().includes(needle),
    );
  }

  const materialsBySupplier = new Map<string, MaterialRecord[]>();
  allMaterials.forEach((material) => {
    if (!material.supplierId) return;
    const existing = materialsBySupplier.get(material.supplierId);
    if (existing) {
      existing.push(material);
    } else {
      materialsBySupplier.set(material.supplierId, [material]);
    }
  });

  const suppliers = filtered
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((supplier) => ({
      ...supplier,
      materials: materialsBySupplier.get(supplier.id) || [],
    }));

  return { suppliers, types };
}

export async function createSupplierRecord(input: Partial<SupplierRecord>) {
  const id = randomUUID();
  const timestamp = nowIso();

  const supplier: SupplierRecord = {
    id,
    name: toStringValue(input.name, 'New Supplier'),
    type: toStringValue(input.type, 'local'),
    website: toStringValue(input.website, ''),
    location: toStringValue(input.location, ''),
    contactInfo: toStringValue(input.contactInfo, ''),
    coverageArea: toStringValue(input.coverageArea, ''),
    categories: toStringValue(input.categories, '[]'),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await getFirebaseDb().collection(COLLECTIONS.suppliers).doc(id).set(supplier);
  return supplier;
}

export async function getSupplierRecord(id: string): Promise<SupplierRecord | null> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.suppliers).doc(id).get();
  if (!snapshot.exists) {
    return null;
  }
  return mapSupplierRecord(snapshot.id, snapshot.data() as Record<string, unknown>);
}

export async function updateSupplierRecord(id: string, updates: Partial<SupplierRecord>): Promise<SupplierRecord | null> {
  const existing = await getSupplierRecord(id);
  if (!existing) {
    return null;
  }

  const payload = {
    name: updates.name ?? existing.name,
    type: updates.type ?? existing.type,
    website: updates.website ?? existing.website,
    location: updates.location ?? existing.location,
    contactInfo: updates.contactInfo ?? existing.contactInfo,
    coverageArea: updates.coverageArea ?? existing.coverageArea,
    categories: updates.categories ?? existing.categories,
    updatedAt: nowIso(),
  };

  await getFirebaseDb().collection(COLLECTIONS.suppliers).doc(id).set(payload, { merge: true });
  return getSupplierRecord(id);
}

export async function deleteSupplierRecord(id: string): Promise<void> {
  const materialsSnapshot = await getFirebaseDb()
    .collection(COLLECTIONS.materials)
    .where('supplierId', '==', id)
    .get();

  if (!materialsSnapshot.empty) {
    const batch = getFirebaseDb().batch();
    materialsSnapshot.docs.forEach((doc) => {
      batch.set(
        doc.ref,
        {
          supplierId: null,
          updatedAt: nowIso(),
          lastUpdated: nowIso(),
        },
        { merge: true },
      );
    });
    await batch.commit();
  }

  await getFirebaseDb().collection(COLLECTIONS.suppliers).doc(id).delete();
}

export async function listMaterialsForApi(params: {
  category?: string | null;
  search?: string | null;
}) {
  const [allMaterials, allSuppliers] = await Promise.all([listAllMaterials(), listAllSuppliers()]);
  const categories = [...new Set(allMaterials.map((material) => material.category))].sort();

  const supplierMap = new Map<string, SupplierRecord>();
  allSuppliers.forEach((supplier) => supplierMap.set(supplier.id, supplier));

  let filtered = allMaterials;
  if (params.category) {
    filtered = filtered.filter((material) => material.category === params.category);
  }

  if (params.search) {
    const needle = params.search.toLowerCase();
    filtered = filtered.filter((material) =>
      `${material.name} ${material.category} ${material.specification}`.toLowerCase().includes(needle),
    );
  }

  const materials = filtered
    .sort((a, b) => {
      const byCategory = a.category.localeCompare(b.category);
      if (byCategory !== 0) return byCategory;
      return a.name.localeCompare(b.name);
    })
    .map((material) => ({
      ...material,
      supplier: material.supplierId ? supplierMap.get(material.supplierId) || null : null,
    }));

  return {
    materials,
    categories,
    totalCount: materials.length,
  };
}

export async function createMaterialRecord(input: Partial<MaterialRecord>) {
  const id = randomUUID();
  const timestamp = nowIso();

  const material: MaterialRecord = {
    id,
    category: toStringValue(input.category, 'misc'),
    name: toStringValue(input.name, 'New Material'),
    specification: toStringValue(input.specification, ''),
    unit: toStringValue(input.unit, 'pc'),
    unitPricePHP: toNumberValue(input.unitPricePHP, 0),
    supplierId: toNullableString(input.supplierId, null),
    lastUpdated: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await getFirebaseDb().collection(COLLECTIONS.materials).doc(id).set(material);
  return material;
}

export async function getMaterialRecord(id: string): Promise<MaterialRecord | null> {
  const snapshot = await getFirebaseDb().collection(COLLECTIONS.materials).doc(id).get();
  if (!snapshot.exists) {
    return null;
  }
  return mapMaterialRecord(snapshot.id, snapshot.data() as Record<string, unknown>);
}

export async function updateMaterialRecord(id: string, updates: Partial<MaterialRecord>) {
  const existing = await getMaterialRecord(id);
  if (!existing) {
    return null;
  }

  const payload = {
    category: updates.category ?? existing.category,
    name: updates.name ?? existing.name,
    specification: updates.specification ?? existing.specification,
    unit: updates.unit ?? existing.unit,
    unitPricePHP: toNumberValue(updates.unitPricePHP, existing.unitPricePHP),
    supplierId: updates.supplierId !== undefined ? updates.supplierId : existing.supplierId,
    updatedAt: nowIso(),
    lastUpdated: nowIso(),
  };

  await getFirebaseDb().collection(COLLECTIONS.materials).doc(id).set(payload, { merge: true });
  return getMaterialRecord(id);
}

export async function deleteMaterialRecord(id: string): Promise<void> {
  await getFirebaseDb().collection(COLLECTIONS.materials).doc(id).delete();
}

export async function createDiagnosticHistory(input: {
  userId: string;
  userEmail?: string;
  systemType: string;
  payload: string;
  result: string;
  faultCount: number;
  maxSeverity: string;
}) {
  const id = randomUUID();
  const record: DiagnosticHistoryRecord = {
    id,
    userId: toStringValue(input.userId, ''),
    userEmail: toStringValue(input.userEmail, ''),
    systemType: input.systemType,
    input: input.payload,
    result: input.result,
    faultCount: input.faultCount,
    maxSeverity: input.maxSeverity,
    createdAt: nowIso(),
  };

  await getFirebaseDb().collection(COLLECTIONS.diagnosticHistory).doc(id).set(record);
  return record;
}

export async function listDiagnosticHistory(
  limit: number,
  options: {
    userId?: string;
    isAdmin?: boolean;
  } = {},
) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const includeAll = options.isAdmin === true;

  if (!includeAll && !options.userId) {
    return [];
  }

  const collectionRef = getFirebaseDb().collection(COLLECTIONS.diagnosticHistory);
  const snapshot = includeAll
    ? await collectionRef
      .orderBy('createdAt', 'desc')
      .limit(safeLimit)
      .get()
    : await collectionRef
      .where('userId', '==', options.userId)
      .limit(safeLimit * 4)
      .get();

  const mapped = snapshot.docs.map((doc) => {
    const record = mapDiagnosticHistoryRecord(doc.id, doc.data() as Record<string, unknown>);

    if (!includeAll && record.userId !== options.userId) {
      return null;
    }

    return {
      id: record.id,
      systemType: record.systemType,
      faultCount: record.faultCount,
      maxSeverity: record.maxSeverity,
      createdAt: record.createdAt,
      ...(includeAll ? { userId: record.userId, userEmail: record.userEmail } : {}),
    };
  });

  return mapped
    .filter((record): record is NonNullable<typeof record> => Boolean(record))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, safeLimit);
}
