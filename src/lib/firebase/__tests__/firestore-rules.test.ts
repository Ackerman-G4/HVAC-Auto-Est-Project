/**
 * Firestore security rules, exercised against the emulator.
 *
 * These require the Firestore emulator. They are excluded from the default
 * vitest run (which must stay hermetic) and run via `npm run test:rules`,
 * which starts the emulator around them.
 *
 * Worth stating up front: no client code in this app touches Firestore. Every
 * read and write goes through the Admin SDK server-side, which bypasses rules
 * entirely. So these rules are not what enforces access today — they are the
 * backstop for anyone holding client credentials, and the holes below are
 * reachable by exactly that route.
 */

import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const OWNER = 'user-owner';
const OTHER = 'user-other';
const ADMIN = 'user-admin';
const PROJECT = 'project-1';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-hvac-auto',
    firestore: {
      rules: readFileSync(resolve(process.cwd(), 'config/firebase/firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 9080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed through a context that ignores rules, so setup cannot be blocked by
  // the very rules under test.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'projects', PROJECT), {
      ownerId: OWNER,
      name: 'BGC Tower',
      status: 'draft',
    });
    await setDoc(doc(db, 'users', ADMIN), { role: 'admin' });
    await setDoc(doc(db, 'users', OWNER), { role: 'engineer' });
  });
});

const asOwner = () => testEnv.authenticatedContext(OWNER).firestore();
const asOther = () => testEnv.authenticatedContext(OTHER).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

describe('project ownership', () => {
  it('lets the owner read their project', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), 'projects', PROJECT)));
  });

  it('denies a different signed-in user', async () => {
    await assertFails(getDoc(doc(asOther(), 'projects', PROJECT)));
  });

  it('denies an anonymous caller', async () => {
    await assertFails(getDoc(doc(asAnon(), 'projects', PROJECT)));
  });

  it('lets the owner update their own project', async () => {
    await assertSucceeds(updateDoc(doc(asOwner(), 'projects', PROJECT), { name: 'Renamed' }));
  });
});

describe('F7 — ownership must be immutable', () => {
  it('refuses to let an owner hand the project to someone else', async () => {
    // The update rule checked resource.data.ownerId — the document as it
    // already exists — and never constrained request.resource.data.ownerId,
    // so the owner could write a different id and transfer the record.
    await assertFails(
      updateDoc(doc(asOwner(), 'projects', PROJECT), { ownerId: OTHER }),
    );
  });

  it('refuses to let an owner orphan the project', async () => {
    // Same hole, worse outcome: nobody can read it afterwards, including the
    // person who did it.
    await assertFails(
      updateDoc(doc(asOwner(), 'projects', PROJECT), { ownerId: 'nobody' }),
    );
  });

  it('still allows an update that leaves ownerId alone', async () => {
    await assertSucceeds(
      updateDoc(doc(asOwner(), 'projects', PROJECT), { ownerId: OWNER, status: 'active' }),
    );
  });

  it('does not let a non-owner claim the project', async () => {
    await assertFails(
      updateDoc(doc(asOther(), 'projects', PROJECT), { ownerId: OTHER }),
    );
  });
});

describe('F8 — the audit trail must not be client-writable', () => {
  it('refuses a client-created audit entry', async () => {
    // `allow create: if isAuthenticated()` let any signed-in caller append
    // arbitrary content. An append-only log that anyone can append to provides
    // no evidentiary value — worse than none, because it invites trust.
    await assertFails(
      setDoc(doc(asOwner(), 'auditLogs', 'forged'), {
        action: 'deleted',
        entity: 'project',
        entityId: PROJECT,
        userId: 'someone-else',
        timestamp: new Date().toISOString(),
      }),
    );
  });

  it('refuses a forged entry attributed to another user', async () => {
    await assertFails(
      setDoc(doc(asOther(), 'auditLogs', 'forged-2'), { userId: OWNER, action: 'approved' }),
    );
  });

  it('still lets an admin read the log', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'auditLogs', 'real'), { action: 'created' });
    });
    await assertSucceeds(
      getDoc(doc(testEnv.authenticatedContext(ADMIN, { role: 'admin' }).firestore(), 'auditLogs', 'real')),
    );
  });

  it('keeps entries immutable once written', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'auditLogs', 'real'), { action: 'created' });
    });
    await assertFails(updateDoc(doc(asOwner(), 'auditLogs', 'real'), { action: 'tampered' }));
    await assertFails(deleteDoc(doc(asOwner(), 'auditLogs', 'real')));
  });
});

describe('the default is deny', () => {
  it('refuses a collection no rule mentions', async () => {
    await assertFails(setDoc(doc(asOwner(), 'somethingUnplanned', 'x'), { a: 1 }));
  });
});
