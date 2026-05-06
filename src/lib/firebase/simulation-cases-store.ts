/**
 * Simulation Cases — Firestore persistence layer
 *
 * Manages CRUD for SimulationCase and RunJob documents scoped to
 * projects/{projectId}/simulationCases/{caseId} and nested runJobs.
 */

import { randomUUID } from 'crypto';
import { getFirebaseDb } from '@/lib/firebase/server';
import { nowIso } from '@/lib/firebase/value-utils';
import type {
  SimulationCase,
  CaseStatus,
  RunJob,
  JobStatus,
  ResidualSnapshot,
  ArtifactManifest,
  StructuredGrid,
  CellZoneType,
} from '@/types/simulation';

// ── Collection helpers ──────────────────────────────────────

// ── Mesh serialization helpers ──────────────────────────────
// Firestore cannot store nested arrays (INVALID_ARGUMENT: invalid nested entity).
// Flatten 3D zones to a 1D array before writing and re-inflate on read.

interface StoredMesh extends Omit<StructuredGrid, 'zones'> {
  zonesFlat: CellZoneType[];
}

function serializeMesh(mesh: StructuredGrid): StoredMesh {
  const flat: CellZoneType[] = [];
  for (let i = 0; i < mesh.nx; i++) {
    for (let j = 0; j < mesh.ny; j++) {
      for (let k = 0; k < mesh.nz; k++) {
        flat.push(mesh.zones[i][j][k]);
      }
    }
  }
  const { zones: _zones, ...rest } = mesh;
  return { ...rest, zonesFlat: flat };
}

function deserializeMesh(stored: StoredMesh | undefined): StructuredGrid | undefined {
  if (!stored) return undefined;
  const { zonesFlat, ...rest } = stored as StoredMesh & { zonesFlat?: CellZoneType[] };
  if (!zonesFlat) return stored as unknown as StructuredGrid;

  const zones: CellZoneType[][][] = [];
  let idx = 0;
  for (let i = 0; i < stored.nx; i++) {
    zones[i] = [];
    for (let j = 0; j < stored.ny; j++) {
      zones[i][j] = [];
      for (let k = 0; k < stored.nz; k++) {
        zones[i][j][k] = zonesFlat[idx++] ?? 'fluid';
      }
    }
  }
  return { ...rest, zones };
}

function serializeCase(doc: SimulationCase): Record<string, unknown> {
  const { mesh, ...rest } = doc;
  const result: Record<string, unknown> = { ...rest };
  if (mesh) result.mesh = serializeMesh(mesh);
  return result;
}

function deserializeCase(data: Record<string, unknown>): SimulationCase {
  const { mesh, ...rest } = data as Record<string, unknown> & { mesh?: StoredMesh };
  return { ...rest, mesh: deserializeMesh(mesh) } as SimulationCase;
}

// ─────────────────────────────────────────────────────────────

function casesCol(projectId: string) {
  return getFirebaseDb()
    .collection('projects')
    .doc(projectId)
    .collection('simulationCases');
}

function jobsCol(projectId: string, caseId: string) {
  return casesCol(projectId).doc(caseId).collection('runJobs');
}

function artifactsCol(projectId: string, caseId: string) {
  return casesCol(projectId).doc(caseId).collection('artifacts');
}

// ── SimulationCase CRUD ─────────────────────────────────────

export async function createSimulationCase(
  input: Omit<SimulationCase, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<SimulationCase> {
  const id = randomUUID();
  const now = nowIso();
  const doc: SimulationCase = {
    ...input,
    id,
    createdAt: now,
    updatedAt: now,
  };
  await casesCol(input.projectId).doc(id).set(serializeCase(doc));
  return doc;
}

export async function getSimulationCase(
  projectId: string,
  caseId: string,
): Promise<SimulationCase | null> {
  const snap = await casesCol(projectId).doc(caseId).get();
  if (!snap.exists) return null;
  return deserializeCase(snap.data() as Record<string, unknown>);
}

export async function listSimulationCases(
  projectId: string,
): Promise<SimulationCase[]> {
  const snap = await casesCol(projectId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => deserializeCase(d.data() as Record<string, unknown>));
}

export async function updateSimulationCase(
  projectId: string,
  caseId: string,
  updates: Partial<Pick<SimulationCase, 'name' | 'description' | 'status' | 'mesh' | 'physics' | 'solver' | 'geometry' | 'activeRunId' | 'resultId' | 'runSource' | 'simulationScope' | 'buildingGeometry'>>,
): Promise<void> {
  const { mesh, ...rest } = updates;
  const firestoreUpdates: Record<string, unknown> = { ...rest, updatedAt: nowIso() };
  if (mesh) firestoreUpdates.mesh = serializeMesh(mesh);
  await casesCol(projectId).doc(caseId).update(firestoreUpdates);
}

export async function updateCaseStatus(
  projectId: string,
  caseId: string,
  status: CaseStatus,
): Promise<void> {
  await casesCol(projectId).doc(caseId).update({
    status,
    updatedAt: nowIso(),
  });
}

export async function deleteSimulationCase(
  projectId: string,
  caseId: string,
): Promise<void> {
  // Delete nested runJobs
  const jobs = await jobsCol(projectId, caseId).listDocuments();
  const batch = getFirebaseDb().batch();
  for (const jobRef of jobs) {
    batch.delete(jobRef);
  }
  // Delete nested artifacts
  const arts = await artifactsCol(projectId, caseId).listDocuments();
  for (const artRef of arts) {
    batch.delete(artRef);
  }
  // Delete the case itself
  batch.delete(casesCol(projectId).doc(caseId));
  await batch.commit();
}

// ── RunJob CRUD ─────────────────────────────────────────────

export async function createRunJob(
  projectId: string,
  caseId: string,
  input: Pick<RunJob, 'ownerId' | 'source' | 'totalIterations'>,
): Promise<RunJob> {
  const id = randomUUID();
  const now = nowIso();
  const job: RunJob = {
    id,
    caseId,
    projectId,
    ownerId: input.ownerId,
    status: 'pending',
    source: input.source,
    currentIteration: 0,
    totalIterations: input.totalIterations,
    residuals: [],
    elapsedSeconds: 0,
    logTail: [],
    createdAt: now,
  };
  await jobsCol(projectId, caseId).doc(id).set(job);
  return job;
}

export async function getRunJob(
  projectId: string,
  caseId: string,
  jobId: string,
): Promise<RunJob | null> {
  const snap = await jobsCol(projectId, caseId).doc(jobId).get();
  if (!snap.exists) return null;
  return snap.data() as RunJob;
}

export async function listRunJobs(
  projectId: string,
  caseId: string,
  limit?: number,
): Promise<RunJob[]> {
  let query = jobsCol(projectId, caseId).orderBy('createdAt', 'desc');

  if (typeof limit === 'number' && Number.isFinite(limit)) {
    query = query.limit(Math.max(1, Math.floor(limit)));
  }

  const snap = await query.get();
  return snap.docs.map((d) => d.data() as RunJob);
}

export async function updateRunJobStatus(
  projectId: string,
  caseId: string,
  jobId: string,
  status: JobStatus,
  extra?: Partial<Pick<RunJob, 'currentIteration' | 'elapsedSeconds' | 'errorMessage' | 'startedAt' | 'completedAt' | 'logTail' | 'buildingVisualization' | 'metricsSnapshot'>>,
): Promise<void> {
  await jobsCol(projectId, caseId).doc(jobId).update({
    status,
    ...extra,
  });
}

export async function appendResiduals(
  projectId: string,
  caseId: string,
  jobId: string,
  snapshot: ResidualSnapshot,
  iteration: number,
  elapsed: number,
): Promise<void> {
  const ref = jobsCol(projectId, caseId).doc(jobId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() as RunJob;
  const residuals = [...data.residuals, snapshot];
  await ref.update({
    residuals,
    currentIteration: iteration,
    elapsedSeconds: elapsed,
  });
}

// ── ArtifactManifest ────────────────────────────────────────

export async function saveArtifactManifest(
  projectId: string,
  caseId: string,
  manifest: ArtifactManifest,
): Promise<void> {
  await artifactsCol(projectId, caseId).doc(manifest.runJobId).set(manifest);
}

export async function getArtifactManifest(
  projectId: string,
  caseId: string,
  runJobId: string,
): Promise<ArtifactManifest | null> {
  const snap = await artifactsCol(projectId, caseId).doc(runJobId).get();
  if (!snap.exists) return null;
  return snap.data() as ArtifactManifest;
}
