import { useMemo, useState } from 'react';
import type { AssigneeSystemRole } from '@/utils/format-assignee-role-label';

export type AvailabilityStatus =
  | 'available'
  | 'partial'
  | 'unavailable'
  | 'no_response';

export interface PoolVolunteer {
  volunteerId: string;
  volunteerName: string;
  status: AvailabilityStatus;
  conflictReason?: string;
  systemRole?: AssigneeSystemRole;
}

interface PoolAssignment {
  volunteerId: string;
  roleId: string;
  status: string;
}

const STATUS_RANK: Record<AvailabilityStatus, number> = {
  available: 0,
  partial: 1,
  unavailable: 2,
  // biome-ignore lint/style/useNamingConvention: AvailabilityStatus snake_case from domain/DB
  no_response: 3,
};

export interface VolunteerPoolItem extends PoolVolunteer {
  workloadCount: number;
}

/**
 * Sidebar filter + sort logic. Sort order:
 *   availability tier (available → partial → unavailable → no_response)
 *   → least-assigned (workloadCount asc) → alphabetical.
 * Name + role filters are both active simultaneously (AND logic).
 */
export function useVolunteerPool(
  volunteers: PoolVolunteer[],
  assignments: PoolAssignment[],
) {
  const [nameFilter, setNameFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  const workload = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of assignments) {
      if (a.status === 'cancelled' || a.status === 'declined') continue;
      map.set(a.volunteerId, (map.get(a.volunteerId) ?? 0) + 1);
    }
    return map;
  }, [assignments]);

  const sortedFilteredVolunteers = useMemo<VolunteerPoolItem[]>(() => {
    const name = nameFilter.trim().toLowerCase();

    const roleVolunteerIds =
      roleFilter === 'all'
        ? null
        : new Set(
            assignments
              .filter((a) => a.roleId === roleFilter)
              .map((a) => a.volunteerId),
          );

    return volunteers
      .filter((v) => {
        if (name && !v.volunteerName.toLowerCase().includes(name)) return false;
        if (roleVolunteerIds && !roleVolunteerIds.has(v.volunteerId))
          return false;
        return true;
      })
      .map((v) => ({ ...v, workloadCount: workload.get(v.volunteerId) ?? 0 }))
      .sort((a, b) => {
        const tier = STATUS_RANK[a.status] - STATUS_RANK[b.status];
        if (tier !== 0) return tier;
        if (a.workloadCount !== b.workloadCount)
          return a.workloadCount - b.workloadCount;
        return a.volunteerName.localeCompare(b.volunteerName);
      });
  }, [volunteers, assignments, workload, nameFilter, roleFilter]);

  return {
    nameFilter,
    roleFilter,
    setNameFilter,
    setRoleFilter,
    sortedFilteredVolunteers,
    workload,
  };
}
