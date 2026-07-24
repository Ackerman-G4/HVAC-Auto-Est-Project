/// <reference lib="webworker" />

import { CFD_CANCELLED_ERROR, runCFDSimulation } from '@/lib/functions/cfd-simulation';
import type {
  CFDWorkerIncomingMessage,
  CFDWorkerOutgoingMessage,
  SimulationInput,
} from '@/types/simulation';

const activeRuns = new Map<string, { aborted: boolean }>();

function post(message: CFDWorkerOutgoingMessage): void {
  self.postMessage(message);
}

function runInWorker(simulationId: string, input: SimulationInput): void {
  const abortState = { aborted: false };
  activeRuns.set(simulationId, abortState);

  const workerInput: SimulationInput = {
    ...input,
    config: {
      ...input.config,
      runtimeMode: 'worker',
    },
  };

  Promise.resolve()
    .then(() => runCFDSimulation(workerInput, {
      simulationId,
      force2DFast: workerInput.config.dimensionMode === '2d-fast' || workerInput.config.mode === 'fast',
      abortSignal: abortState,
      onProgress: (progress) => {
        post({
          type: 'progress',
          simulationId,
          progress,
        });
      },
    }))
    .then((result) => {
      if (abortState.aborted) {
        post({ type: 'cancelled', simulationId });
        return;
      }

      post({
        type: 'completed',
        simulationId,
        result,
      });
    })
    .catch((error) => {
      if (abortState.aborted || (error instanceof Error && error.message === CFD_CANCELLED_ERROR)) {
        post({ type: 'cancelled', simulationId });
        return;
      }

      post({
        type: 'error',
        simulationId,
        error: error instanceof Error ? error.message : 'Worker simulation failed',
      });
    })
    .finally(() => {
      activeRuns.delete(simulationId);
    });
}

self.onmessage = (event: MessageEvent<CFDWorkerIncomingMessage>) => {
  const message = event.data;

  if (message.type === 'cancel') {
    const active = activeRuns.get(message.simulationId);
    if (active) {
      active.aborted = true;
    }
    return;
  }

  if (message.type === 'start') {
    runInWorker(message.payload.simulationId, message.payload.input);
  }
};
