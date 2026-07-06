export type AssigneeSystemRole = 'leader' | 'sub_leader' | 'volunteer';
export type AssigneeRoleLabel = 'Leader' | 'Sub-leader';

/**
 * Maps a raw domain system role to its display badge label.
 * Returns undefined for plain volunteers — no badge is shown for them,
 * only Leader/Sub-leader need disambiguating (FR-013).
 */
export function formatAssigneeRoleLabel(
  systemRole: AssigneeSystemRole | undefined,
): AssigneeRoleLabel | undefined {
  if (systemRole === 'leader') return 'Leader';
  if (systemRole === 'sub_leader') return 'Sub-leader';
  return undefined;
}
