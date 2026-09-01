import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structural guard: every project-scoped route enforces ownership.
 *
 * Ten handlers under `projects/[id]` shipped with `requireAuth` and no owner
 * check. Because the stores use the Firebase Admin SDK, which bypasses
 * Firestore security rules, the handler is the only gate — so the omission was
 * a live horizontal privilege escalation, not a missing second layer.
 *
 * A unit test on `canAccessProject` cannot catch the class of defect that
 * caused this: the helper was already correct and already existed, and was
 * simply not called. What failed was coverage across route files, so that is
 * what this asserts. It also means a route added later cannot quietly omit the
 * check — this test fails until it is either gated or explicitly exempted with
 * a reason.
 */

const ROUTES_ROOT = join(process.cwd(), 'src', 'app', 'api', 'projects');

/** Any of these establishes that the handler checks project ownership. */
const OWNERSHIP_MARKERS = [
  'checkProjectAccess',
  'requireProjectAccess',
  'canAccessProject',
  'projectAccessDenied',
  'isOwnerOrAdmin',
  'isProjectOwnerOrAdmin',
];

/**
 * Routes that legitimately carry no per-project owner check, each with the
 * reason it does not need one. Anything not listed here must be gated.
 */
const EXEMPT: Record<string, string> = {
  'route.ts':
    'Collection endpoint. GET scopes the query by ownerId (admin sees all) and POST stamps ownership on create, so there is no single project to check.',
  '[id]/simulations/[simId]/run/route.ts':
    'Delegates to lib/simulation/run-orchestrator, which performs the ownership check before any store write.',
  '[id]/simulations/[simId]/runs/[runId]/openfoam-callback/route.ts':
    'Machine-to-machine callback authenticated by a shared secret header, not by a user session; there is no user to compare against.',
};

function collectRouteFiles(dir: string, prefix = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...collectRouteFiles(join(dir, entry.name), rel));
    } else if (entry.name === 'route.ts') {
      found.push(rel);
    }
  }
  return found;
}

const routeFiles = collectRouteFiles(ROUTES_ROOT);

const gated = (relativePath: string): boolean => {
  const source = readFileSync(join(ROUTES_ROOT, relativePath), 'utf8');
  return OWNERSHIP_MARKERS.some((marker) => source.includes(marker));
};

describe('every project-scoped route enforces ownership', () => {
  it('finds the route files to check', () => {
    // Guards the guard: a broken path would otherwise make this suite pass by
    // examining nothing at all.
    expect(routeFiles.length).toBeGreaterThan(15);
  });

  it.each(routeFiles.filter((file) => !(file in EXEMPT)))(
    'projects/%s checks project ownership',
    (file) => {
      expect(gated(file)).toBe(true);
    },
  );

  it('keeps every exemption pointing at a route that still exists', () => {
    // A stale exemption is how a real gap gets hidden: the file is renamed, the
    // exemption keeps matching nothing, and the new file is never checked.
    for (const exemptPath of Object.keys(EXEMPT)) {
      expect(routeFiles).toContain(exemptPath);
    }
  });

  it('documents a reason for every exemption', () => {
    for (const [exemptPath, reason] of Object.entries(EXEMPT)) {
      expect(reason.length, `${exemptPath} needs a reason`).toBeGreaterThan(40);
    }
  });
});
