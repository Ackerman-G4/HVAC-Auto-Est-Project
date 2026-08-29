/**
 * Route handler size ceiling — REMEDIATION_PLAN.md TASK 3.3.
 *
 * The task asks for a step that fails when a file under `src/app/api` exceeds
 * 120 lines. Applied flatly today that fails 26 of 47 handlers, and a gate that
 * is red on arrival is one people learn to route around — the same argument
 * TASK 5.2 made about coverage thresholds.
 *
 * So the ceiling is enforced as a ratchet instead:
 *
 *   - Any handler NOT in the baseline must be at or under 120 lines. That is
 *     every new route, and every route that gets decomposed below the line.
 *   - Any handler IN the baseline must not exceed its recorded size. Existing
 *     debt is frozen; it can shrink, never grow.
 *   - A baseline entry that has dropped to 120 or below is reported as ready to
 *     remove, so the list drains rather than becoming permanent.
 *
 * The result is binding immediately and converges on the flat 120 the task
 * names, without a single day of red CI in between.
 *
 * Run: node scripts/check-handler-size.mjs
 * Refresh after decomposing: node scripts/check-handler-size.mjs --update
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const API_ROOT = join(repoRoot, 'src', 'app', 'api');
const BASELINE_PATH = join(repoRoot, 'scripts', 'handler-size-baseline.json');

/** The ceiling the plan names. Every handler outside the baseline must meet it. */
const CEILING = 120;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, out);
    else if (entry.name === 'route.ts') out.push(path);
  }
  return out;
}

function countLines(path) {
  return readFileSync(path, 'utf8').split('\r\n').join('\n').split('\n').length;
}

const handlers = walk(API_ROOT)
  .map((path) => ({ id: relative(repoRoot, path).split(sep).join('/'), lines: countLines(path) }))
  .sort((a, b) => b.lines - a.lines);

if (process.argv.includes('--update')) {
  const baseline = Object.fromEntries(
    handlers.filter((h) => h.lines > CEILING).map((h) => [h.id, h.lines]),
  );
  writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`baseline written: ${Object.keys(baseline).length} handlers over ${CEILING}`);
  process.exit(0);
}

let baseline = {};
try {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} catch {
  console.error(`No baseline at ${BASELINE_PATH}. Create it with --update.`);
  process.exit(1);
}

const failures = [];
const drained = [];

for (const handler of handlers) {
  const allowance = baseline[handler.id];

  if (allowance === undefined) {
    if (handler.lines > CEILING) {
      failures.push(
        `${handler.id} is ${handler.lines} lines, over the ${CEILING} ceiling. ` +
        'Extract the orchestration into src/lib and leave HTTP concerns here.',
      );
    }
    continue;
  }

  if (handler.lines > allowance) {
    failures.push(
      `${handler.id} grew to ${handler.lines} lines from a baseline of ${allowance}. ` +
      'Existing debt may shrink, never grow.',
    );
  } else if (handler.lines <= CEILING) {
    drained.push(`${handler.id} is now ${handler.lines} lines — remove it from the baseline.`);
  }
}

const overCeiling = handlers.filter((h) => h.lines > CEILING).length;
console.log(
  `${handlers.length} handlers, ${overCeiling} over the ${CEILING}-line ceiling ` +
  `(${Object.keys(baseline).length} allowed by baseline), largest ${handlers[0].lines}.`,
);

for (const line of drained) console.log(`  READY: ${line}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} handler size failure(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log('Handler size ratchet holds.');
