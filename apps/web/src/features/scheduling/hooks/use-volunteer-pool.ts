import { useMemo, useState } from 'react';
import { isActiveAssignment } from './use-cycle-builder';
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
  /**
   * Role names this volunteer is qualified for, already resolved from ids so
   * the card stays presentational. Empty when the member has no qualifications.
   */
  qualifiedRoleNames?: string[];
  /**
   * ISO instant of this volunteer's most recent serving assignment, carried
   * straight off the wire. Absent when they have never served.
   */
  lastServedAt?: string;
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
 *
 * The role filter keys on **qualification** (a role name from
 * `qualifiedRoleNames`), the same basis "group by role" uses — not on who is
 * currently assigned to the role. `'all'` is the no-filter sentinel.
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
      if (!isActiveAssignment({ status: a.status })) continue;
      map.set(a.volunteerId, (map.get(a.volunteerId) ?? 0) + 1);
    }
    return map;
  }, [assignments]);

  const sortedFilteredVolunteers = useMemo<VolunteerPoolItem[]>(() => {
    const name = nameFilter.trim().toLowerCase();

    return volunteers
      .filter((v) => {
        if (name && !v.volunteerName.toLowerCase().includes(name)) return false;
        if (roleFilter !== 'all' && !v.qualifiedRoleNames?.includes(roleFilter))
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
  }, [volunteers, workload, nameFilter, roleFilter]);

  return {
    nameFilter,
    roleFilter,
    setNameFilter,
    setRoleFilter,
    sortedFilteredVolunteers,
    workload,
  };
}
