/**
 * CFD Engineering-tier cloud orchestration (plan §4.2–4.3, §D5).
 *
 * Encapsulates the two side effects the OpenFOAM path needs:
 *   1. Upload the generated case package + run metadata to the GCS exchange bucket.
 *   2. Trigger the `cfd-solver` Cloud Run Job with env overrides pointing at that object.
 *
 * No new queue/dependency is introduced (plan §D5): the Firestore `runJobs`
 * subcollection is the job state, Cloud Run Jobs is the compute queue, and this
 * module speaks to both using credentials already configured for firebase-admin.
 *
 * Everything is env-guarded. When the Engineering tier is not provisioned (no
 * bucket / job configured — the current default), {@link isOpenFOAMCloudConfigured}
 * returns false and callers surface a clean "not provisioned" response instead of
 * throwing. This keeps the Preview tier and the rest of the app fully functional
 * before C1/C2 (local proof + GCP provisioning) are complete.
 */

import { getFirebaseAdminApp } from '@/lib/firebase/server';

export interface OpenFOAMCloudConfig {
  /** GCS bucket used to exchange job inputs/outputs (transient, lifecycle-deleted). */
  bucket: string;
  /** Cloud Run Job resource name, e.g. "cfd-solver". */
  jobName: string;
  /** Cloud Run region, e.g. "asia-southeast1". */
  region: string;
  /** GCP project id hosting the job. */
  projectId: string;
  /** Shared secret the solver echoes back in X-Callback-Secret on the callback. */
  callbackSecret: string;
  /** Public base URL of this app, used to build the solver callback URL. */
  callbackBaseUrl?: string | undefined;
}

export class OpenFOAMCloudNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `Engineering tier (OpenFOAM cloud) is not provisioned. Missing env: ${missing.join(', ')}. ` +
        'Complete plan phases C1 (local proof) and C2 (Artifact Registry + GCS bucket + Cloud Run Job) first.',
    );
    this.name = 'OpenFOAMCloudNotConfiguredError';
  }
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function resolveProjectId(): string | undefined {
  return (
    readEnv('CFD_GCP_PROJECT') ||
    readEnv('FIREBASE_PROJECT_ID') ||
    readEnv('GCLOUD_PROJECT') ||
    readEnv('GOOGLE_CLOUD_PROJECT')
  );
}

/** Which required config values are missing (empty when fully provisioned). */
export function missingOpenFOAMCloudConfig(): string[] {
  const missing: string[] = [];
  if (!readEnv('CFD_GCS_BUCKET')) missing.push('CFD_GCS_BUCKET');
  if (!readEnv('CFD_CLOUD_RUN_JOB')) missing.push('CFD_CLOUD_RUN_JOB');
  if (!readEnv('CFD_CLOUD_RUN_REGION')) missing.push('CFD_CLOUD_RUN_REGION');
  if (!resolveProjectId()) missing.push('CFD_GCP_PROJECT');
  if (!readEnv('CFD_CALLBACK_SECRET')) missing.push('CFD_CALLBACK_SECRET');
  return missing;
}

export function isOpenFOAMCloudConfigured(): boolean {
  return missingOpenFOAMCloudConfig().length === 0;
}

export function getOpenFOAMCloudConfig(): OpenFOAMCloudConfig {
  const missing = missingOpenFOAMCloudConfig();
  if (missing.length > 0) {
    throw new OpenFOAMCloudNotConfiguredError(missing);
  }
  return {
    bucket: readEnv('CFD_GCS_BUCKET')!,
    jobName: readEnv('CFD_CLOUD_RUN_JOB')!,
    region: readEnv('CFD_CLOUD_RUN_REGION')!,
    projectId: resolveProjectId()!,
    callbackSecret: readEnv('CFD_CALLBACK_SECRET')!,
    callbackBaseUrl: readEnv('CFD_CALLBACK_BASE_URL') || readEnv('NEXT_PUBLIC_APP_URL'),
  };
}

/** Shared secret used to verify inbound solver callbacks. */
export function getCallbackSecret(): string | undefined {
  return readEnv('CFD_CALLBACK_SECRET');
}

/**
 * Build the absolute callback URL the solver will POST results to. Prefers an
 * explicitly configured base URL; falls back to the request origin so local /
 * preview deployments work without extra config.
 */
export function resolveCallbackUrl(
  requestOrigin: string,
  projectId: string,
  simId: string,
  runId: string,
  configuredBaseUrl?: string,
): string {
  const base = (configuredBaseUrl || requestOrigin).replace(/\/+$/, '');
  return `${base}/api/projects/${projectId}/simulations/${simId}/runs/${runId}/openfoam-callback`;
}

/** GCS object path for a run's input package. */
export function caseInputObjectPath(projectId: string, simId: string, runId: string): string {
  return `cfd-runs/${projectId}/${simId}/${runId}/input.json`;
}

/** GCS object path where the solver writes its result package. */
export function resultOutputObjectPath(projectId: string, simId: string, runId: string): string {
  return `cfd-runs/${projectId}/${simId}/${runId}/result.json`;
}

/**
 * Upload the case-input JSON payload to the exchange bucket.
 * Uses firebase-admin Cloud Storage (same credentials as Firestore).
 */
export async function uploadCaseInput(
  config: OpenFOAMCloudConfig,
  objectPath: string,
  payload: unknown,
): Promise<void> {
  // Dynamic import keeps firebase-admin/storage out of the module graph for
  // callers that never touch the Engineering tier.
  const { getStorage } = await import('firebase-admin/storage');
  const bucket = getStorage(getFirebaseAdminApp()).bucket(config.bucket);
  const file = bucket.file(objectPath);
  await file.save(JSON.stringify(payload), {
    contentType: 'application/json',
    resumable: false,
    metadata: { cacheControl: 'no-store' },
  });
}

interface GoogleOAuthAccessToken {
  access_token: string;
  expires_in: number;
}

async function getAccessToken(): Promise<string> {
  const app = getFirebaseAdminApp();
  const credential = app.options.credential as
    | { getAccessToken?: () => Promise<GoogleOAuthAccessToken> }
    | undefined;
  if (!credential?.getAccessToken) {
    throw new Error('No credential available to authenticate the Cloud Run Jobs call.');
  }
  const token = await credential.getAccessToken();
  if (!token?.access_token) {
    throw new Error('Failed to obtain a Google OAuth access token.');
  }
  return token.access_token;
}

export interface TriggerSolveOptions {
  runJobId: string;
  inputObjectPath: string;
  resultObjectPath: string;
  callbackUrl: string;
}

/**
 * Trigger the cfd-solver Cloud Run Job with per-run env overrides. Returns the
 * Cloud Run execution name. Never blocks on the solve — the job runs async and
 * reports back via the callback route.
 */
export async function triggerSolveJob(
  config: OpenFOAMCloudConfig,
  options: TriggerSolveOptions,
): Promise<string> {
  const token = await getAccessToken();
  const endpoint =
    `https://run.googleapis.com/v2/projects/${config.projectId}` +
    `/locations/${config.region}/jobs/${config.jobName}:run`;

  const env = [
    { name: 'CASE_INPUT_PATH', value: `gs://${config.bucket}/${options.inputObjectPath}` },
    { name: 'RESULT_OUTPUT_PATH', value: `gs://${config.bucket}/${options.resultObjectPath}` },
    { name: 'RUN_JOB_ID', value: options.runJobId },
    { name: 'CALLBACK_URL', value: options.callbackUrl },
    { name: 'CALLBACK_SECRET', value: config.callbackSecret },
  ];

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      overrides: {
        containerOverrides: [{ env }],
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Cloud Run Jobs :run failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const body = (await response.json().catch(() => ({}))) as { name?: string };
  return body.name ?? `${config.jobName}-execution`;
}
