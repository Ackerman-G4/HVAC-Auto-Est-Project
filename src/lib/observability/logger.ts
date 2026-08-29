/**
 * Structured logging.
 *
 * REMEDIATION_PLAN.md TASK 5.5. Replaces 135 bare `console.error` calls whose
 * output was unstructured, unfilterable and uncorrelated: a failure in one
 * request could not be tied to the rest of that request's lines, and there was
 * no way to turn any of it down in production.
 *
 * Three properties the bare calls did not have:
 *
 * 1. **A level, and a way to silence it.** `LOG_LEVEL` (server) or
 *    `NEXT_PUBLIC_LOG_LEVEL` (browser) gates output. Tests set it to `silent`.
 * 2. **A correlation id.** `logger.withCorrelationId(id)` returns a child that
 *    stamps every line, so one request's lines can be collected out of an
 *    interleaved stream.
 * 3. **A serialisable error.** `console.error('x:', err)` prints `{}` for an
 *    Error in a JSON transport, because `message` and `stack` are not
 *    enumerable. They are lifted explicitly here.
 *
 * It writes through `console` underneath — that is what both runtimes give us.
 * The point is that it is the *only* place allowed to, which the `no-console`
 * lint rule enforces.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

function isLogLevel(value: string | undefined): value is LogLevel {
  return value !== undefined && value in LEVEL_ORDER;
}

/**
 * Resolved once per module load.
 *
 * The browser cannot read a bare `process.env` at runtime, so the client bundle
 * relies on `NEXT_PUBLIC_LOG_LEVEL` being inlined at build time. Default is
 * `info`, which keeps warnings and errors and drops debug chatter.
 */
function resolveLevel(): LogLevel {
  const configured =
    typeof process !== 'undefined'
      ? (process.env.LOG_LEVEL ?? process.env.NEXT_PUBLIC_LOG_LEVEL)
      : undefined;
  return isLogLevel(configured) ? configured : 'info';
}

const activeLevel = resolveLevel();

/** Structured fields attached to a line. */
export interface LogContext {
  readonly correlationId?: string;
  readonly [key: string]: unknown;
}

/**
 * Errors are not JSON-serialisable: `message` and `stack` are non-enumerable,
 * so `JSON.stringify(new Error('boom'))` is `{}`. Lifting them is the whole
 * reason a caught error must not be handed straight to a transport.
 */
function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const serialised: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
    // Typed errors in this codebase carry code/context; keep them.
    for (const key of Object.keys(error) as Array<keyof typeof error>) {
      serialised[String(key)] = error[key];
    }
    if (error.cause !== undefined) serialised.cause = serialiseError(error.cause);
    return serialised;
  }
  return { value: error };
}

export interface LogEntry {
  readonly level: Exclude<LogLevel, 'silent'>;
  readonly message: string;
  readonly timestamp: string;
  readonly correlationId?: string;
  readonly context?: Record<string, unknown>;
  readonly error?: Record<string, unknown>;
}

/** Swappable so tests can capture entries without touching the console. */
export type LogSink = (entry: LogEntry) => void;

function defaultSink(entry: LogEntry): void {
  // The single sanctioned console use in the codebase; eslint.config.mjs
  // exempts this file by path rather than by inline directive, so the
  // exemption is visible in one place instead of buried here.
  const write = entry.level === 'error' ? console.error : entry.level === 'warn' ? console.warn : console.log;
  write(JSON.stringify(entry));
}

let sink: LogSink = defaultSink;

/** Replace the transport. Returns a function restoring the previous one. */
export function setLogSink(next: LogSink): () => void {
  const previous = sink;
  sink = next;
  return () => { sink = previous; };
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  /** `error` is the caught value, serialised rather than stringified. */
  error(message: string, error?: unknown, context?: LogContext): void;
  /** A child stamping every line with this id. */
  withCorrelationId(correlationId: string): Logger;
}

function emit(
  level: Exclude<LogLevel, 'silent'>,
  correlationId: string | undefined,
  message: string,
  context?: LogContext,
  error?: unknown,
): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[activeLevel]) return;

  const { correlationId: contextId, ...rest } = context ?? {};
  const id = contextId ?? correlationId;

  sink({
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(id !== undefined ? { correlationId: id } : {}),
    ...(Object.keys(rest).length > 0 ? { context: rest } : {}),
    ...(error !== undefined ? { error: serialiseError(error) } : {}),
  });
}

function createLogger(correlationId?: string): Logger {
  return {
    debug: (message, context) => emit('debug', correlationId, message, context),
    info: (message, context) => emit('info', correlationId, message, context),
    warn: (message, context) => emit('warn', correlationId, message, context),
    error: (message, error, context) => emit('error', correlationId, message, context, error),
    withCorrelationId: (id) => createLogger(id),
  };
}

export const logger: Logger = createLogger();

/** The level actually in force, for a diagnostics endpoint to report. */
export function activeLogLevel(): LogLevel {
  return activeLevel;
}
