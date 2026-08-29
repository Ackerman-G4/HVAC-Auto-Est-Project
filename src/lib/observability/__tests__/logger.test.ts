import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger, setLogSink, type LogEntry } from '../logger';

/**
 * The structured logger, TASK 5.5.
 *
 * What it replaced was 135 bare `console.error` calls. The three properties
 * those lacked are what these tests hold it to: a level that can be turned
 * down, a correlation id that ties one request's lines together, and an error
 * that survives serialisation.
 */

function capture(): { entries: LogEntry[]; restore: () => void } {
  const entries: LogEntry[] = [];
  const restore = setLogSink((entry) => entries.push(entry));
  return { entries, restore };
}

let restoreSink: (() => void) | null = null;
afterEach(() => {
  restoreSink?.();
  restoreSink = null;
  vi.unstubAllEnvs();
});

describe('a line carries its level, message and time', () => {
  it('emits the message and level it was given', () => {
    const { entries, restore } = capture();
    restoreSink = restore;

    logger.error('BOQ generation failed');

    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe('error');
    expect(entries[0].message).toBe('BOQ generation failed');
  });

  it('timestamps every line in ISO 8601, so lines can be ordered', () => {
    const { entries, restore } = capture();
    restoreSink = restore;

    logger.warn('slow query');
    expect(Number.isNaN(Date.parse(entries[0].timestamp))).toBe(false);
  });

  it('attaches structured context rather than interpolating it into the message', () => {
    const { entries, restore } = capture();
    restoreSink = restore;

    logger.info('run dispatched', { runId: 'job-1', iterations: 500 });

    // The value stays a number, so a log search can compare on it.
    expect(entries[0].context).toEqual({ runId: 'job-1', iterations: 500 });
  });

  it('omits context entirely when there is none', () => {
    const { entries, restore } = capture();
    restoreSink = restore;

    logger.info('ready');
    expect(entries[0].context).toBeUndefined();
  });
});

describe('an error survives serialisation', () => {
  it('lifts message and stack, which JSON.stringify would drop', () => {
    // JSON.stringify(new Error('boom')) is '{}' -- message and stack are not
    // enumerable. This is the whole reason a caught error cannot be handed
    // straight to a transport.
    const { entries, restore } = capture();
    restoreSink = restore;

    logger.error('solver failed', new Error('diverged at iteration 12'));

    expect(entries[0].error?.message).toBe('diverged at iteration 12');
    expect(entries[0].error?.name).toBe('Error');
    expect(typeof entries[0].error?.stack).toBe('string');
  });

  it('keeps the extra fields a typed error carries', () => {
    const { entries, restore } = capture();
    restoreSink = restore;

    class CalculationError extends Error {
      constructor(message: string, readonly code: string, readonly context: string) {
        super(message);
        this.name = 'CalculationError';
      }
    }
    logger.error('guard tripped', new CalculationError('division by zero', 'DIVISION_BY_ZERO', 'boq.costPerTR'));

    expect(entries[0].error?.code).toBe('DIVISION_BY_ZERO');
    expect(entries[0].error?.context).toBe('boq.costPerTR');
  });

  it('records a thrown non-Error rather than losing it', () => {
    const { entries, restore } = capture();
    restoreSink = restore;

    logger.error('odd throw', 'a bare string');
    expect(entries[0].error).toEqual({ value: 'a bare string' });
  });

  it('follows an error cause chain', () => {
    const { entries, restore } = capture();
    restoreSink = restore;

    logger.error('upload failed', new Error('outer', { cause: new Error('socket closed') }));
    expect((entries[0].error?.cause as Record<string, unknown>).message).toBe('socket closed');
  });
});

describe('correlation ties one request together', () => {
  it('stamps every line from a child logger', () => {
    const { entries, restore } = capture();
    restoreSink = restore;

    const requestLog = logger.withCorrelationId('req-42');
    requestLog.info('started');
    requestLog.error('failed', new Error('nope'));

    expect(entries.map((e) => e.correlationId)).toEqual(['req-42', 'req-42']);
  });

  it('leaves the parent logger uncorrelated', () => {
    const { entries, restore } = capture();
    restoreSink = restore;

    logger.withCorrelationId('req-42');
    logger.info('unrelated');

    expect(entries[0].correlationId).toBeUndefined();
  });

  it('lets an explicit context id win over the child id', () => {
    const { entries, restore } = capture();
    restoreSink = restore;

    logger.withCorrelationId('req-42').info('forwarded', { correlationId: 'upstream-7' });
    expect(entries[0].correlationId).toBe('upstream-7');
  });
});

describe('the level can be turned down', () => {
  it('drops lines below the configured level', async () => {
    vi.stubEnv('LOG_LEVEL', 'error');
    vi.resetModules();
    const mod = await import('../logger');

    const entries: LogEntry[] = [];
    const restore = mod.setLogSink((entry) => entries.push(entry));

    mod.logger.debug('noise');
    mod.logger.info('noise');
    mod.logger.warn('noise');
    mod.logger.error('kept');

    restore();
    expect(entries.map((e) => e.message)).toEqual(['kept']);
  });

  it('silences everything at the silent level', async () => {
    vi.stubEnv('LOG_LEVEL', 'silent');
    vi.resetModules();
    const mod = await import('../logger');

    const entries: LogEntry[] = [];
    const restore = mod.setLogSink((entry) => entries.push(entry));

    mod.logger.error('even this');

    restore();
    expect(entries).toHaveLength(0);
  });

  it('falls back to info when the level is unset or nonsense', async () => {
    vi.stubEnv('LOG_LEVEL', 'chatty');
    vi.resetModules();
    const mod = await import('../logger');

    expect(mod.activeLogLevel()).toBe('info');
  });
});
