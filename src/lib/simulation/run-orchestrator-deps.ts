/**
 * Production wiring for the run orchestrator.
 *
 * The orchestrator declares what it needs; this is the single place those
 * declarations meet real Firestore and the real solvers. Kept out of the route
 * because binding persistence to a service is not an HTTP concern
 * (CLAUDE.md §2.7), and keeping it here leaves the route reading as nothing but
 * auth, parse, delegate, map.
 *
 * A test supplies its own object of the same type and never reaches the network.
 */

import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  appendResiduals,
  createRunJob,
  getArtifactManifest,
  getRunJob,
  getSimulationCase,
  saveArtifactManifest,
  saveRunFieldSnapshot,
  updateCaseStatus,
  updateRunJobStatus,
  updateSimulationCase,
} from '@/lib/firebase/simulation-cases-store';
import { runCFDSimulation } from '@/lib/functions/cfd-simulation';
import { runBuildingCFDSimulation } from '@/lib/functions/building-cfd-simulation';
import { buildRunFieldSnapshotFromResult } from '@/lib/simulation/field-snapshot';
import type { RunOrchestratorDeps } from '@/lib/simulation/run-orchestrator';

export const productionRunDeps: RunOrchestratorDeps = {
  getProjectRecord,
  getSimulationCase,
  updateSimulationCase,
  updateCaseStatus,
  createRunJob,
  getRunJob,
  updateRunJobStatus,
  appendResiduals,
  saveArtifactManifest,
  getArtifactManifest,
  saveRunFieldSnapshot,
  runCFDSimulation,
  runBuildingCFDSimulation,
  buildRunFieldSnapshotFromResult,
};
