import { describe, expect, it } from 'vitest';
import { canAccessProject, checkProjectAccess } from '../project-access';

/**
 * Project-level authorisation.
 *
 * Ten route handlers under `projects/[id]` authenticated the caller and then
 * did nothing with the answer — no comparison against the project's owner. Every
 * store call runs through the Firebase Admin SDK, which bypasses Firestore
 * security rules, so the handler was not defence in depth: it was the only gate,
 * and it was open. Any signed-in user could read or overwrite another account's
 * BOQ, rooms, floors or equipment by guessing a project id.
 *
 * These fix the contract in one place so the ten call sites cannot each get it
 * subtly wrong.
 */

const owner = { id: 'user-1', role: 'engineer' };
const stranger = { id: 'user-2', role: 'engineer' };
const admin = { id: 'user-9', role: 'admin' };

describe('who may reach a project', () => {
  it('admits the recorded owner', () => {
    expect(canAccessProject({ ownerId: 'user-1' }, owner)).toBe(true);
  });

  it('refuses a signed-in user who is not the owner', () => {
    // The whole point: authentication is not authorisation.
    expect(canAccessProject({ ownerId: 'user-1' }, stranger)).toBe(false);
  });

  it('admits an admin regardless of owner', () => {
    expect(canAccessProject({ ownerId: 'user-1' }, admin)).toBe(true);
  });

  it('falls back to createdBy on a project written before ownerId existed', () => {
    expect(canAccessProject({ createdBy: 'user-1' }, owner)).toBe(true);
    expect(canAccessProject({ createdBy: 'user-1' }, stranger)).toBe(false);
  });

  it('prefers ownerId over createdBy, so a transfer takes effect', () => {
    const transferred = { ownerId: 'user-2', createdBy: 'user-1' };
    expect(canAccessProject(transferred, stranger)).toBe(true);
    expect(canAccessProject(transferred, owner)).toBe(false);
  });

  it('refuses everyone when a project records no owner at all', () => {
    // An unowned record is a data defect. Denying is the safe reading; the
    // alternative makes every orphaned project world-writable.
    expect(canAccessProject({}, owner)).toBe(false);
    expect(canAccessProject({}, stranger)).toBe(false);
  });

  it('still admits an admin to an unowned project, so it can be repaired', () => {
    expect(canAccessProject({}, admin)).toBe(true);
  });

  it('does not treat an empty owner string as a match for an empty id', () => {
    // Guards against `'' === ''` admitting a caller with no id.
    expect(canAccessProject({ ownerId: '' }, { id: '', role: 'engineer' })).toBe(false);
  });
});

describe('the guard a handler actually calls', () => {
  it('passes the project through for an owner', () => {
    const result = checkProjectAccess({ ownerId: 'user-1', id: 'p1' }, owner);
    expect(result.ok).toBe(true);
    expect(result.ok && result.project.id).toBe('p1');
  });

  it('reports a missing project as not found, not as denied', async () => {
    // A caller may legitimately own a project that has since been deleted;
    // telling them it is gone is more useful than telling them it is forbidden.
    const result = checkProjectAccess(null, owner);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(404);
  });

  it('denies a stranger with 403 rather than 404', async () => {
    const result = checkProjectAccess({ ownerId: 'user-1' }, stranger);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(403);
  });

  it('carries a machine-readable code the client can branch on', async () => {
    const result = checkProjectAccess({ ownerId: 'user-1' }, stranger);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const body = await result.response.json();
    expect(body.code).toBe('PROJECT_ACCESS_DENIED');
  });

  it('does not leak the owner identity in the denial', async () => {
    // The denial body must not become an oracle for who owns what.
    const result = checkProjectAccess({ ownerId: 'user-1' }, stranger);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(JSON.stringify(await result.response.json())).not.toContain('user-1');
  });
});
