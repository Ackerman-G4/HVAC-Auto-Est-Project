/** Production wiring for Engineering-tier dispatch. See dispatch-engineering-run.ts. */

import { getProjectRecord } from '@/lib/firebase/projects-store';
import {
  createRunJob,
  getSimulationCase,
  updateCaseStatus,
  updateRunJobStatus,
  updateSimulationCase,
} from '@/lib/firebase/simulation-cases-store';
import { buildOpenFOAMConfig, generateCaseFiles } from '@/lib/engine/simulation/openfoam-exporter';
import { buildStructuredGrid, recommendCellSize } from '@/lib/engine/simulation/geometry-builder';
import { toFallbackGeometry } from '@/lib/simulation/building-case';
import {
  caseInputObjectPath,
  getOpenFOAMCloudConfig,
  isOpenFOAMCloudConfigured,
  missingOpenFOAMCloudConfig,
  resolveCallbackUrl,
  resultOutputObjectPath,
  triggerSolveJob,
  uploadCaseInput,
} from '@/lib/engine/simulation/cfd-cloud';
import type { DispatchRunDeps } from '@/lib/simulation/dispatch-engineering-run';

export const productionDispatchDeps: DispatchRunDeps = {
  getProjectRecord,
  getSimulationCase,
  createRunJob,
  updateSimulationCase,
  updateCaseStatus,
  updateRunJobStatus,
  buildOpenFOAMConfig,
  generateCaseFiles,
  buildStructuredGrid,
  recommendCellSize,
  toFallbackGeometry,
  isOpenFOAMCloudConfigured,
  missingOpenFOAMCloudConfig,
  getOpenFOAMCloudConfig,
  uploadCaseInput,
  triggerSolveJob,
  resolveCallbackUrl,
  caseInputObjectPath,
  resultOutputObjectPath,
};
