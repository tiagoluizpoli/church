import type { VolunteerPoolItem } from '../../hooks/use-volunteer-pool';

export type GroupMode = 'all' | 'status' | 'role';

interface VolunteerGroupInput {
  volunteers: VolunteerPoolItem[];
}

interface PartitionVolunteersByFocusInput {
  volunteers: VolunteerPoolItem[];
  /** Volunteer ids for the focused shift×role, already ranked best-first. */
  focusedVolunteerIds: string[];
}

interface GroupModeInput {
  value: string;
}

export interface FocusPartition {
  focused: VolunteerPoolItem[];
  others: VolunteerPoolItem[];
}

export interface StatusVolunteerGroups {
  ready: VolunteerPoolItem[];
  awaiting: VolunteerPoolItem[];
  unavailable: VolunteerPoolItem[];
}

export interface RoleVolunteerGroup {
  roleName: string;
  volunteers: VolunteerPoolItem[];
}

/**
 * Splits the pool into the focused shift×role's ranked candidates and everyone
 * else, keeping the caller's ranking for the former and the pool's own sort for
 * the latter.
 */
export function partitionVolunteersByFocus({
  volunteers,
  focusedVolunteerIds,
}: PartitionVolunteersByFocusInput): FocusPartition {
  const rankById = new Map(
    focusedVolunteerIds.map((volunteerId, index) => [volunteerId, index]),
  );
  const focused: VolunteerPoolItem[] = [];
  const others: VolunteerPoolItem[] = [];

  for (const volunteer of volunteers) {
    if (rankById.has(volunteer.volunteerId)) focused.push(volunteer);
    else others.push(volunteer);
  }
  focused.sort(
    (left, right) =>
      (rankById.get(left.volunteerId) ?? 0) -
      (rankById.get(right.volunteerId) ?? 0),
  );

  return { focused, others };
}

/**
 * Input order is preserved inside every group, which is what lets focus
 * ranking and grouping compose: a grouped rail still shows the best candidate
 * first within each group.
 */
export function groupVolunteersByStatus({
  volunteers,
}: VolunteerGroupInput): StatusVolunteerGroups {
  const groups: StatusVolunteerGroups = {
    ready: [],
    awaiting: [],
    unavailable: [],
  };

  for (const volunteer of volunteers) {
    if (volunteer.status === 'available') groups.ready.push(volunteer);
    else if (volunteer.status === 'unavailable') {
      groups.unavailable.push(volunteer);
    } else groups.awaiting.push(volunteer);
  }

  return groups;
}

/** A volunteer qualified for several roles appears under each of them. */
export function groupVolunteersByRole({
  volunteers,
}: VolunteerGroupInput): RoleVolunteerGroup[] {
  const volunteersByRole = new Map<string, VolunteerPoolItem[]>();
  const withoutQualification: VolunteerPoolItem[] = [];

  for (const volunteer of volunteers) {
    if (!volunteer.qualifiedRoleNames?.length) {
      withoutQualification.push(volunteer);
      continue;
    }

    for (const roleName of volunteer.qualifiedRoleNames) {
      const group = volunteersByRole.get(roleName);
      if (group) group.push(volunteer);
      else volunteersByRole.set(roleName, [volunteer]);
    }
  }

  const groups = Array.from(
    volunteersByRole,
    ([roleName, groupedVolunteers]): RoleVolunteerGroup => ({
      roleName,
      volunteers: groupedVolunteers,
    }),
  ).sort((a, b) => a.roleName.localeCompare(b.roleName));

  if (withoutQualification.length) {
    groups.push({
      roleName: 'No qualified roles',
      volunteers: withoutQualification,
    });
  }

  return groups;
}

/** Narrows a menu value to a GroupMode, or null when it is not one. */
export function toGroupMode({ value }: GroupModeInput): GroupMode | null {
  return value === 'all' || value === 'status' || value === 'role'
    ? value
    : null;
}
