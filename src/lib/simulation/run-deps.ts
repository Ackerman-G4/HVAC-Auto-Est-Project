/**
 * Binds the run orchestrator to the real Firestore stores.
 *
 * Separated from the route so the handler imports one value instead of eleven
 * store functions, and so the wiring is stated once rather than per HTTP verb.
 * The orchestrator itself never imports from `lib/firebase`; this is the only
 * place the two are joined.
 */

import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  getSimulationCase,
  updateCaseStatus,
  updateSimulationCase,
  createRunJob,
  getRunJob,
  getArtifactManifest,
  updateRunJobStatus,
  appendResiduals,
  saveArtifactManifest,
  saveRunFieldSnapshot,
} from '@/lib/firebase/simulation-cases-store';
import type { RunOrchestratorDeps } from './run-orchestrator';

export const runOrchestratorDeps: RunOrchestratorDeps = {
  getProjectRecord,
  getSimulationCase,
  createRunJob,
  getRunJob,
  getArtifactManifest,
  updateRunJobStatus,
  updateCaseStatus,
  updateSimulationCase,
  appendResiduals,
  saveArtifactManifest,
  saveRunFieldSnapshot,
  now: () => Date.now(),
};
