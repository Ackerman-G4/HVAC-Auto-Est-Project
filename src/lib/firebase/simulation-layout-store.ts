import { getFirebaseDb } from '@/lib/firebase/server';
import { nowIso } from '@/lib/firebase/value-utils';
import type {
  SimulationLayoutDoc,
  LayoutHVACPlacement,
  LayoutTilePlacement,
} from '@/types/simulation';

const SUBCOLLECTION = 'simulationLayouts';

/** Firestore document ID is deterministic: `{floorId}` under project scope. */
function docPath(projectId: string, floorId: string) {
  return `projects/${projectId}/${SUBCOLLECTION}/${floorId}`;
}

// ── Mappers ─────────────────────────────────────────────────

function mapHVAC(raw: Record<string, unknown>): LayoutHVACPlacement {
  return {
    id: String(raw.id ?? ''),
    type: (raw.type ?? 'crac') as LayoutHVACPlacement['type'],
    label: String(raw.label ?? ''),
    position: {
      x: Number(raw.positionX ?? 0),
      y: Number(raw.positionY ?? 0),
      z: Number(raw.positionZ ?? 0),
    },
    orientation: Number(raw.orientation ?? 0),
    capacityKW: Number(raw.capacityKW ?? 0),
    airflowCFM: Number(raw.airflowCFM ?? 0),
  };
}

function mapTile(raw: Record<string, unknown>): LayoutTilePlacement {
  return {
    id: String(raw.id ?? ''),
    x: Number(raw.x ?? 0),
    y: Number(raw.y ?? 0),
    openArea: Number(raw.openArea ?? 0.25),
    tileSize: Number(raw.tileSize ?? 0.6),
  };
}

function serializeHVAC(h: LayoutHVACPlacement): Record<string, unknown> {
  return {
    id: h.id,
    type: h.type,
    label: h.label,
    positionX: h.position.x,
    positionY: h.position.y,
    positionZ: h.position.z,
    orientation: h.orientation,
    capacityKW: h.capacityKW,
    airflowCFM: h.airflowCFM,
  };
}

function serializeTile(t: LayoutTilePlacement): Record<string, unknown> {
  return {
    id: t.id,
    x: t.x,
    y: t.y,
    openArea: t.openArea,
    tileSize: t.tileSize,
  };
}

// ── CRUD ────────────────────────────────────────────────────

export async function getSimulationLayout(
  projectId: string,
  floorId: string,
): Promise<SimulationLayoutDoc | null> {
  const db = getFirebaseDb();
  const snap = await db.doc(docPath(projectId, floorId)).get();
  if (!snap.exists) return null;

  const data = snap.data() as Record<string, unknown>;
  const hvacRaw = (data.hvacPlacements ?? []) as Record<string, unknown>[];
  const tilesRaw = (data.tilePlacements ?? []) as Record<string, unknown>[];

  return {
    projectId,
    floorId,
    hvacPlacements: hvacRaw.map(mapHVAC),
    tilePlacements: tilesRaw.map(mapTile),
    canvasScale: Number(data.canvasScale ?? 50),
    updatedAt: String(data.updatedAt ?? ''),
  };
}

export async function upsertSimulationLayout(
  projectId: string,
  floorId: string,
  layout: Pick<SimulationLayoutDoc, 'hvacPlacements' | 'tilePlacements' | 'canvasScale'>,
): Promise<void> {
  const db = getFirebaseDb();
  await db.doc(docPath(projectId, floorId)).set(
    {
      projectId,
      floorId,
      hvacPlacements: layout.hvacPlacements.map(serializeHVAC),
      tilePlacements: layout.tilePlacements.map(serializeTile),
      canvasScale: layout.canvasScale,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
}
