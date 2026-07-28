import { describe, expect, it } from 'vitest';
import { getLocalFirestore } from '../local-firestore';

/**
 * `simulation-layout-store` addresses documents by path
 * (`projects/{id}/simulationLayouts/{floorId}`) the way the real Firestore SDK
 * does. The local dev mock originally only implemented `collection()`, so every
 * simulation-layout read/write threw "db.doc is not a function" in local mode.
 * These lock the path semantics in.
 */
describe('local-firestore doc(path)', () => {
  const db = getLocalFirestore();

  it('resolves a two-segment collection/doc path', () => {
    const ref = db.doc('projects/abc');
    expect(ref.id).toBe('abc');
  });

  it('resolves a nested subcollection document path', () => {
    const ref = db.doc('projects/proj-1/simulationLayouts/floor-7');
    expect(ref.id).toBe('floor-7');
  });

  it('namespaces nested docs per parent so floors of different projects do not collide', () => {
    const a = db.doc('projects/proj-a/simulationLayouts/floor-1');
    const b = db.doc('projects/proj-b/simulationLayouts/floor-1');
    // Same document id...
    expect(a.id).toBe(b.id);
    // ...but they must not be the same underlying record.
    expect(a).not.toBe(b);
  });

  it('rejects an odd-segment path (that addresses a collection, not a document)', () => {
    expect(() => db.doc('projects')).toThrow(/even number of segments/i);
    expect(() => db.doc('projects/proj-1/simulationLayouts')).toThrow(/even number of segments/i);
  });

  it('tolerates leading and trailing slashes', () => {
    expect(db.doc('/projects/proj-1/simulationLayouts/floor-2/').id).toBe('floor-2');
  });
});
