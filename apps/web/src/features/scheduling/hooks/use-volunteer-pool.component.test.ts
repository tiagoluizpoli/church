import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { type PoolVolunteer, useVolunteerPool } from './use-volunteer-pool';

const vol = (
  id: string,
  name: string,
  status: PoolVolunteer['status'],
): PoolVolunteer => ({ volunteerId: id, volunteerName: name, status });

describe('useVolunteerPool (T098)', () => {
  describe('Sort order', () => {
    it('orders by availability tier: available → partial → unavailable → no_response', () => {
      const volunteers = [
        vol('1', 'A', 'no_response'),
        vol('2', 'B', 'unavailable'),
        vol('3', 'C', 'partial'),
        vol('4', 'D', 'available'),
      ];
      const { result } = renderHook(() => useVolunteerPool(volunteers, []));
      expect(
        result.current.sortedFilteredVolunteers.map((v) => v.volunteerId),
      ).toEqual(['4', '3', '2', '1']);
    });

    it('breaks tier ties by least workload, then alphabetically', () => {
      const volunteers = [
        vol('1', 'Zoe', 'available'),
        vol('2', 'Amy', 'available'),
        vol('3', 'Bob', 'available'),
      ];
      // Amy has 2 active assignments, others 0 → Amy sinks below Bob/Zoe;
      // Bob and Zoe tie on workload → alphabetical (Bob before Zoe).
      const assignments = [
        { volunteerId: '2', roleId: 'r1', status: 'confirmed' },
        { volunteerId: '2', roleId: 'r2', status: 'pending' },
      ];
      const { result } = renderHook(() =>
        useVolunteerPool(volunteers, assignments),
      );
      expect(
        result.current.sortedFilteredVolunteers.map((v) => v.volunteerName),
      ).toEqual(['Bob', 'Zoe', 'Amy']);
    });

    it('ignores cancelled and declined assignments in workload', () => {
      const volunteers = [vol('1', 'A', 'available')];
      const assignments = [
        { volunteerId: '1', roleId: 'r1', status: 'cancelled' },
        { volunteerId: '1', roleId: 'r2', status: 'declined' },
        { volunteerId: '1', roleId: 'r3', status: 'confirmed' },
      ];
      const { result } = renderHook(() =>
        useVolunteerPool(volunteers, assignments),
      );
      expect(result.current.sortedFilteredVolunteers[0].workloadCount).toBe(1);
    });
  });

  describe('Filters (AND logic)', () => {
    const qualified = (
      id: string,
      name: string,
      roles: string[],
    ): PoolVolunteer => ({
      volunteerId: id,
      volunteerName: name,
      status: 'available',
      qualifiedRoleNames: roles,
    });
    const volunteers = [
      qualified('1', 'Alice Smith', ['Usher']),
      qualified('2', 'Bob Jones', ['Greeter']),
      qualified('3', 'Alice Brown', ['Usher', 'Greeter']),
    ];

    it('filters by name (case-insensitive substring)', () => {
      const { result } = renderHook(() => useVolunteerPool(volunteers, []));
      act(() => result.current.setNameFilter('alice'));
      expect(
        result.current.sortedFilteredVolunteers
          .map((v) => v.volunteerId)
          .sort(),
      ).toEqual(['1', '3']);
    });

    it('filters by role on qualification, not on who is assigned to it', () => {
      const { result } = renderHook(() => useVolunteerPool(volunteers, []));
      act(() => result.current.setRoleFilter('Usher'));
      // Alice Smith + Alice Brown are Usher-qualified; Bob (Greeter only) is out.
      expect(
        result.current.sortedFilteredVolunteers
          .map((v) => v.volunteerId)
          .sort(),
      ).toEqual(['1', '3']);
    });

    it('excludes a volunteer not qualified for the filtered role', () => {
      const { result } = renderHook(() => useVolunteerPool(volunteers, []));
      act(() => result.current.setRoleFilter('Greeter'));
      expect(
        result.current.sortedFilteredVolunteers.map((v) => v.volunteerId),
      ).not.toContain('1');
    });

    it('applies name AND role filters simultaneously', () => {
      const { result } = renderHook(() => useVolunteerPool(volunteers, []));
      act(() => {
        result.current.setNameFilter('alice');
        result.current.setRoleFilter('Greeter');
      });
      // Alice Brown matches name AND is Greeter-qualified → id 3 only.
      expect(
        result.current.sortedFilteredVolunteers.map((v) => v.volunteerId),
      ).toEqual(['3']);
    });

    it('returns empty when filters match nobody', () => {
      const { result } = renderHook(() => useVolunteerPool(volunteers, []));
      act(() => result.current.setNameFilter('zzz'));
      expect(result.current.sortedFilteredVolunteers).toHaveLength(0);
    });
  });
});
