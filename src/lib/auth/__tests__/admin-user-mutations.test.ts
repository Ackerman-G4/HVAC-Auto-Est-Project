import { describe, expect, it } from 'vitest';
import {
  assertAdminMutationAllowed,
  AdminMutationError,
  type MutableAdminUser,
} from '../admin-user-mutations';

const admin = (id: string, disabled = false): MutableAdminUser => ({ id, role: 'admin', disabled });
const engineer = (id: string, disabled = false): MutableAdminUser => ({
  id,
  role: 'engineer',
  disabled,
});

describe('assertAdminMutationAllowed', () => {
  it('blocks an admin from disabling their own account', () => {
    const self = admin('a1');
    expect(() =>
      assertAdminMutationAllowed('a1', self, [self, admin('a2')], { type: 'disable' }),
    ).toThrow(AdminMutationError);
  });

  it('blocks an admin from demoting their own role', () => {
    const self = admin('a1');
    expect(() =>
      assertAdminMutationAllowed('a1', self, [self, admin('a2')], {
        type: 'setRole',
        role: 'engineer',
      }),
    ).toThrow(AdminMutationError);
  });

  it('allows disabling another admin when a second enabled admin remains', () => {
    const target = admin('a2');
    expect(() =>
      assertAdminMutationAllowed('a1', target, [admin('a1'), target], { type: 'disable' }),
    ).not.toThrow();
  });

  it('blocks disabling the last enabled admin', () => {
    const target = admin('a2');
    const users = [engineer('e1'), target];
    expect(() => assertAdminMutationAllowed('a1', target, users, { type: 'disable' })).toThrow(
      AdminMutationError,
    );
  });

  it('blocks demoting the last enabled admin to engineer', () => {
    const target = admin('a2');
    const users = [engineer('e1'), target];
    expect(() =>
      assertAdminMutationAllowed('a1', target, users, { type: 'setRole', role: 'engineer' }),
    ).toThrow(AdminMutationError);
  });

  it('does not count already-disabled admins as remaining coverage', () => {
    const target = admin('a2');
    const users = [admin('a3', true), target];
    expect(() => assertAdminMutationAllowed('a1', target, users, { type: 'disable' })).toThrow(
      AdminMutationError,
    );
  });

  it('allows promoting an engineer to admin', () => {
    const target = engineer('e1');
    expect(() =>
      assertAdminMutationAllowed('a1', target, [admin('a1'), target], {
        type: 'setRole',
        role: 'admin',
      }),
    ).not.toThrow();
  });

  it('always allows enabling an account, even the last-admin edge case', () => {
    const target = admin('a2', true);
    expect(() =>
      assertAdminMutationAllowed('a1', target, [admin('a1'), target], { type: 'enable' }),
    ).not.toThrow();
  });

  it('allows disabling a non-admin target freely', () => {
    const target = engineer('e1');
    expect(() =>
      assertAdminMutationAllowed('a1', target, [admin('a1'), target], { type: 'disable' }),
    ).not.toThrow();
  });
});
