/**
 * JSON-file-backed Firestore mock for local development.
 * Supports the subset of Firestore API used by:
 *   - projects-store.ts
 *   - project-estimation-store.ts
 *   - catalog-store.ts
 *
 * Data persisted to .local-firestore.json at workspace root.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DB_FILE = join(process.cwd(), '.local-firestore.json');

type DocData = Record<string, unknown>;

interface Store {
  [collection: string]: {
    [docId: string]: DocData;
  };
}

// ── Persistence ────────────────────────────────────────────

function readStore(): Store {
  if (!existsSync(DB_FILE)) return {};
  try {
    let raw = readFileSync(DB_FILE, 'utf-8');
    // Strip UTF-8 BOM if present (e.g. from PowerShell Set-Content)
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  writeFileSync(DB_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

// ── Mock Document Snapshot ─────────────────────────────────

class LocalDocSnapshot {
  readonly id: string;
  private _data: DocData | undefined;

  constructor(id: string, data: DocData | undefined) {
    this.id = id;
    this._data = data;
  }

  get exists(): boolean {
    return this._data !== undefined;
  }

  data(): DocData | undefined {
    return this._data;
  }

  get ref() {
    return { id: this.id };
  }
}

// ── Mock Query Snapshot ────────────────────────────────────

class LocalQuerySnapshot {
  readonly docs: LocalDocSnapshot[];

  constructor(docs: LocalDocSnapshot[]) {
    this.docs = docs;
  }

  get empty(): boolean {
    return this.docs.length === 0;
  }

  get size(): number {
    return this.docs.length;
  }

  forEach(cb: (doc: LocalDocSnapshot) => void): void {
    this.docs.forEach(cb);
  }
}

// ── Comparison helpers ─────────────────────────────────────

function matchesOp(docVal: unknown, op: string, queryVal: unknown): boolean {
  switch (op) {
    case '==':
      return docVal === queryVal;
    case '!=':
      return docVal !== queryVal;
    case '<':
      return (docVal as number) < (queryVal as number);
    case '<=':
      return (docVal as number) <= (queryVal as number);
    case '>':
      return (docVal as number) > (queryVal as number);
    case '>=':
      return (docVal as number) >= (queryVal as number);
    case 'in':
      return Array.isArray(queryVal) && queryVal.includes(docVal);
    default:
      return false;
  }
}

// ── Mock Query ─────────────────────────────────────────────

interface WhereClause {
  field: string;
  op: string;
  value: unknown;
}

interface OrderClause {
  field: string;
  direction: string;
}

class LocalQuery {
  private colName: string;
  private wheres: WhereClause[];
  private orders: OrderClause[];
  private limitN: number;

  constructor(
    colName: string,
    wheres: WhereClause[] = [],
    orders: OrderClause[] = [],
    limitN = Infinity,
  ) {
    this.colName = colName;
    this.wheres = wheres;
    this.orders = orders;
    this.limitN = limitN;
  }

  where(field: string, op: string, value: unknown): LocalQuery {
    return new LocalQuery(
      this.colName,
      [...this.wheres, { field, op, value }],
      this.orders,
      this.limitN,
    );
  }

  orderBy(field: string, direction: string = 'asc'): LocalQuery {
    return new LocalQuery(
      this.colName,
      this.wheres,
      [...this.orders, { field, direction }],
      this.limitN,
    );
  }

  limit(n: number): LocalQuery {
    return new LocalQuery(this.colName, this.wheres, this.orders, n);
  }

  async get(): Promise<LocalQuerySnapshot> {
    const store = readStore();
    const col = store[this.colName] || {};

    let docs = Object.entries(col)
      .map(([id, data]) => ({ id, data }))
      .filter(({ data }) => this.wheres.every((w) => matchesOp(data[w.field], w.op, w.value)));

    // Sort
    for (const order of this.orders) {
      docs.sort((a, b) => {
        const va = a.data[order.field];
        const vb = b.data[order.field];
        if (va === vb) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        const cmp = va < vb ? -1 : 1;
        return order.direction === 'desc' ? -cmp : cmp;
      });
    }

    if (this.limitN < docs.length) {
      docs = docs.slice(0, this.limitN);
    }

    return new LocalQuerySnapshot(
      docs.map((d) => new LocalDocSnapshot(d.id, d.data)),
    );
  }
}

// ── Mock Document Reference ────────────────────────────────

class LocalDocRef {
  readonly id: string;
  private colName: string;

  constructor(colName: string, id: string) {
    this.colName = colName;
    this.id = id;
  }

  async get(): Promise<LocalDocSnapshot> {
    const store = readStore();
    const data = store[this.colName]?.[this.id];
    return new LocalDocSnapshot(this.id, data);
  }

  async set(data: DocData, options?: { merge?: boolean }): Promise<void> {
    const store = readStore();
    if (!store[this.colName]) store[this.colName] = {};
    if (options?.merge && store[this.colName][this.id]) {
      store[this.colName][this.id] = { ...store[this.colName][this.id], ...data };
    } else {
      store[this.colName][this.id] = { ...data };
    }
    writeStore(store);
  }

  async update(data: DocData): Promise<void> {
    const store = readStore();
    if (!store[this.colName]) store[this.colName] = {};
    store[this.colName][this.id] = { ...store[this.colName][this.id], ...data };
    writeStore(store);
  }

  async delete(): Promise<void> {
    const store = readStore();
    if (store[this.colName]) {
      delete store[this.colName][this.id];
      writeStore(store);
    }
  }
}

// ── Mock Batch ─────────────────────────────────────────────

interface BatchOp {
  type: 'set' | 'delete';
  colName: string;
  docId: string;
  data?: DocData;
  options?: { merge?: boolean };
}

class LocalBatch {
  private ops: BatchOp[] = [];

  set(ref: LocalDocRef, data: DocData, options?: { merge?: boolean }): void {
    this.ops.push({
      type: 'set',
      colName: (ref as unknown as { colName: string }).colName,
      docId: ref.id,
      data,
      options,
    });
  }

  delete(ref: LocalDocRef): void {
    this.ops.push({
      type: 'delete',
      colName: (ref as unknown as { colName: string }).colName,
      docId: ref.id,
    });
  }

  async commit(): Promise<void> {
    const store = readStore();
    for (const op of this.ops) {
      if (!store[op.colName]) store[op.colName] = {};
      if (op.type === 'set' && op.data) {
        if (op.options?.merge && store[op.colName][op.docId]) {
          store[op.colName][op.docId] = { ...store[op.colName][op.docId], ...op.data };
        } else {
          store[op.colName][op.docId] = { ...op.data };
        }
      } else if (op.type === 'delete') {
        delete store[op.colName][op.docId];
      }
    }
    writeStore(store);
  }
}

// ── Mock Collection Reference ──────────────────────────────

class LocalCollectionRef extends LocalQuery {
  private _colName: string;

  constructor(colName: string) {
    super(colName);
    this._colName = colName;
  }

  doc(id: string): LocalDocRef {
    return new LocalDocRef(this._colName, id);
  }
}

// ── Mock Firestore ─────────────────────────────────────────

class LocalFirestore {
  collection(name: string): LocalCollectionRef {
    return new LocalCollectionRef(name);
  }

  batch(): LocalBatch {
    return new LocalBatch();
  }
}

// Singleton
let _instance: LocalFirestore | null = null;

export function getLocalFirestore(): LocalFirestore {
  if (!_instance) {
    _instance = new LocalFirestore();
  }
  return _instance;
}

export function isLocalFirestoreMode(): boolean {
  // No Firebase credentials configured → use local store
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY_BASE64;
  const gac = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;

  // If emulator host is set but no credentials, still use local if the emulator isn't actually running
  if (saJson?.trim()) return false;
  if (projectId?.trim() && clientEmail?.trim() && privateKey?.trim()) return false;
  if (gac?.trim()) return false;
  // If emulator is configured, let Firebase SDK try it
  if (emulator?.trim()) return false;

  return true;
}
