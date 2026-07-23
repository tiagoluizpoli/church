import { describe, expect, it } from 'vitest';
import type { VolunteerPoolItem } from '../../hooks/use-volunteer-pool';
import {
  groupVolunteersByRole,
  groupVolunteersByStatus,
  partitionVolunteersByFocus,
  toGroupMode,
} from './volunteer-pool-groups';

function makeVolunteer(
  overrides: Partial<VolunteerPoolItem> &
    Pick<VolunteerPoolItem, 'volunteerId' | 'volunteerName'>,
): VolunteerPoolItem {
  return {
    status: 'available',
    workloadCount: 0,
    ...overrides,
  };
}

const ana = makeVolunteer({ volunteerId: 'ana', volunteerName: 'Ana' });
const bruno = makeVolunteer({ volunteerId: 'bruno', volunteerName: 'Bruno' });
const carla = makeVolunteer({ volunteerId: 'carla', volunteerName: 'Carla' });

describe('partitionVolunteersByFocus', () => {
  it('promotes the focused ids in their given rank, leaving the rest in pool order', () => {
    const partition = partitionVolunteersByFocus({
      volunteers: [ana, bruno, carla],
      focusedVolunteerIds: ['carla', 'ana'],
    });

    expect(partition.focused.map((v) => v.volunteerId)).toEqual([
      'carla',
      'ana',
    ]);
    expect(partition.others.map((v) => v.volunteerId)).toEqual(['bruno']);
  });

  it('keeps the whole pool reachable — focus promotes, it does not filter', () => {
    const partition = partitionVolunteersByFocus({
      volunteers: [ana, bruno, carla],
      focusedVolunteerIds: ['ana'],
    });

    expect(partition.focused).toHaveLength(1);
    expect(partition.others).toHaveLength(2);
  });

  it('ignores focused ids that are not in the pool', () => {
    const partition = partitionVolunteersByFocus({
      volunteers: [ana],
      focusedVolunteerIds: ['stranger', 'ana'],
    });

    expect(partition.focused.map((v) => v.volunteerId)).toEqual(['ana']);
    expect(partition.others).toEqual([]);
  });

  it('puts everyone under others when nothing is ranked', () => {
    const partition = partitionVolunteersByFocus({
      volunteers: [ana, bruno],
      focusedVolunteerIds: [],
    });

    expect(partition.focused).toEqual([]);
    expect(partition.others).toHaveLength(2);
  });
});

describe('groupVolunteersByStatus', () => {
  it('preserves input order inside each group so a focus ranking survives grouping', () => {
    const groups = groupVolunteersByStatus({
      volunteers: [
        makeVolunteer({
          volunteerId: 'second',
          volunteerName: 'Zoe',
          status: 'available',
        }),
        makeVolunteer({
          volunteerId: 'first',
          volunteerName: 'Ana',
          status: 'available',
        }),
      ],
    });

    expect(groups.ready.map((v) => v.volunteerId)).toEqual(['second', 'first']);
  });

  it('reads partial and no_response as awaiting, and unavailable on its own', () => {
    const groups = groupVolunteersByStatus({
      volunteers: [
        makeVolunteer({
          volunteerId: 'partial',
          volunteerName: 'Ana',
          status: 'partial',
        }),
        makeVolunteer({
          volunteerId: 'silent',
          volunteerName: 'Bruno',
          status: 'no_response',
        }),
        makeVolunteer({
          volunteerId: 'out',
          volunteerName: 'Carla',
          status: 'unavailable',
        }),
      ],
    });

    expect(groups.awaiting).toHaveLength(2);
    expect(groups.unavailable).toHaveLength(1);
    expect(groups.ready).toEqual([]);
  });
});

describe('groupVolunteersByRole', () => {
  it('lists a multi-qualified volunteer under each of their roles', () => {
    const groups = groupVolunteersByRole({
      volunteers: [
        makeVolunteer({
          volunteerId: 'both',
          volunteerName: 'Ana',
          qualifiedRoleNames: ['Usher', 'Greeter'],
        }),
      ],
    });

    expect(groups.map((group) => group.roleName)).toEqual(['Greeter', 'Usher']);
  });

  it('keeps unqualified volunteers visible under their own heading, last', () => {
    const groups = groupVolunteersByRole({
      volunteers: [
        makeVolunteer({
          volunteerId: 'none',
          volunteerName: 'Ana',
          qualifiedRoleNames: [],
        }),
        makeVolunteer({
          volunteerId: 'greeter',
          volunteerName: 'Bruno',
          qualifiedRoleNames: ['Greeter'],
        }),
      ],
    });

    expect(groups.at(-1)?.roleName).toBe('No qualified roles');
  });
});

describe('toGroupMode', () => {
  it('narrows the three real modes and rejects anything else', () => {
    expect(toGroupMode({ value: 'all' })).toBe('all');
    expect(toGroupMode({ value: 'status' })).toBe('status');
    expect(toGroupMode({ value: 'role' })).toBe('role');
    expect(toGroupMode({ value: 'nonsense' })).toBeNull();
  });
});
