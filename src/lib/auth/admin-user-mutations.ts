/**
 * Pure safety rules for admin-triggered account mutations (disable/enable/role
 * change). Kept separate from the API route and the firebase/local storage
 * backends so the invariants (no self-lockout, never remove the last admin)
 * are testable without any I/O.
 */

export interface MutableAdminUser {
  id: string;
  role: 'admin' | 'engineer';
  disabled: boolean;
}

export type AdminMutation =
  | { type: 'disable' }
  | { type: 'enable' }
  | { type: 'setRole'; role: 'admin' | 'engineer' };

export class AdminMutationError extends Error {}

/**
 * Throws AdminMutationError when the mutation would lock the acting admin
 * out of their own account, or leave the system with zero enabled admins.
 */
export function assertAdminMutationAllowed(
  actorId: string,
  target: MutableAdminUser,
  allUsers: MutableAdminUser[],
  mutation: AdminMutation,
): void {
  if (target.id === actorId) {
    throw new AdminMutationError('You cannot change your own account status or role.');
  }

  if (mutation.type === 'enable') {
    return;
  }

  const isDemotingOrDisablingAdmin =
    target.role === 'admin' &&
    !target.disabled &&
    (mutation.type === 'disable' || mutation.role !== 'admin');

  if (!isDemotingOrDisablingAdmin) {
    return;
  }

  const otherEnabledAdmins = allUsers.filter(
    (u) => u.id !== target.id && u.role === 'admin' && !u.disabled,
  ).length;

  if (otherEnabledAdmins === 0) {
    throw new AdminMutationError('Cannot remove the last remaining admin account.');
  }
}
