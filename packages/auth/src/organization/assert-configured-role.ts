import { APIError } from 'better-auth/api';
import { organizationRoles } from './roles';

interface AssertConfiguredRoleInput {
  role: string | undefined;
}

const configuredRoles = new Set(Object.keys(organizationRoles));

/**
 * Rejects any role outside the configured `member | admin` set.
 *
 * Better Auth validates invited roles against its own defaults unioned with
 * ours, and does not validate `add-member` roles at all, so `owner` would
 * otherwise reach the database through those endpoints. Wired into the
 * plugin's before-hooks, this keeps `owner` unnameable end to end.
 *
 * Roles arrive as a comma-separated string when a caller assigns several.
 */
export function assertConfiguredRole({
  role,
}: AssertConfiguredRoleInput): void {
  if (!role) return;

  const unknownRoles = role
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .filter((candidate) => !configuredRoles.has(candidate));

  if (unknownRoles.length > 0) {
    throw new APIError('BAD_REQUEST', {
      message: `Unknown organization role: ${unknownRoles.join(', ')}. Allowed roles are ${[...configuredRoles].join(', ')}.`,
    });
  }
}
