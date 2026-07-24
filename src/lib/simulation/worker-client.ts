import {
  CFD_CANCELLED_ERROR,
} from '@/lib/functions/cfd-simulation';
import type {
  CFDWorkerIncomingMessage,
  CFDWorkerOutgoingMessage,
  SimulationInput,
  SimulationResult,
  SimulationRunProgress,
} from '@/types/simulation';

interface WorkerRunOptions {
  simulationId?: string;
  onProgress?: (progress: SimulationRunProgress) => void;
  abortSignal?: AbortSignal;
}

interface PendingRun {
  resolve: (result: SimulationResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: SimulationRunProgress) => void;
}

export class CFDWorkerClient {
  private worker: Worker | null = null;
  private pendingRuns = new Map<string, PendingRun>();

  static isSupported(): boolean {
    return typeof window !== 'undefined' && typeof Worker !== 'undefined';
  }

  private ensureWorker(): Worker {
    if (!CFDWorkerClient.isSupported()) {
      throw new Error('Web Worker is not supported in this environment');
    }

    if (this.worker) {
      return this.worker;
    }

    this.worker = new Worker(new URL('../../workers/cfd.worker.ts', import.meta.url), {
      type: 'module',
    });

    this.worker.onmessage = (event: MessageEvent<CFDWorkerOutgoingMessage>) => {
      this.handleMessage(event.data);
    };

    this.worker.onerror = () => {
      for (const [id, pending] of this.pendingRuns.entries()) {
        pending.reject(new Error('CFD worker crashed'));
        this.pendingRuns.delete(id);
      }
      this.worker = null;
    };

    return this.worker;
  }

  private handleMessage(message: CFDWorkerOutgoingMessage): void {
    const pending = this.pendingRuns.get(message.simulationId);
    if (!pending) {
      return;
    }

    if (message.type === 'progress') {
      pending.onProgress?.(message.progress);
      return;
    }

    if (message.type === 'completed') {
      pending.resolve(message.result);
      this.pendingRuns.delete(message.simulationId);
      return;
    }

    if (message.type === 'cancelled') {
      pending.reject(new Error(CFD_CANCELLED_ERROR));
      this.pendingRuns.delete(message.simulationId);
      return;
    }

    if (message.type === 'error') {
      pending.reject(new Error(message.error));
      this.pendingRuns.delete(message.simulationId);
    }
  }

  run(input: SimulationInput, options: WorkerRunOptions = {}): Promise<SimulationResult> {
    const worker = this.ensureWorker();
    const simulationId = options.simulationId ?? crypto.randomUUID();

    const payload: CFDWorkerIncomingMessage = {
      type: 'start',
      payload: {
        simulationId,
        input,
      },
    };

    return new Promise<SimulationResult>((resolve, reject) => {
      this.pendingRuns.set(simulationId, {
        resolve,
        reject,
        onProgress: options.onProgress,
      });

      if (options.abortSignal) {
        const handleAbort = () => {
          this.cancel(simulationId);
        };

        if (options.abortSignal.aborted) {
          handleAbort();
        } else {
          options.abortSignal.addEventListener('abort', handleAbort, { once: true });
        }
      }

      worker.postMessage(payload);
    });
  }

  cancel(simulationId: string): void {
    if (!this.worker) {
      return;
    }

    const cancelMessage: CFDWorkerIncomingMessage = {
      type: 'cancel',
      simulationId,
    };

    this.worker.postMessage(cancelMessage);
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }

    for (const [id, pending] of this.pendingRuns.entries()) {
      pending.reject(new Error('CFD worker terminated'));
      this.pendingRuns.delete(id);
    }
  }
}

export const cfdWorkerClient = new CFDWorkerClient();
