import { describe, expect, it } from 'vitest';
import type { VolunteerPoolItem } from '../../hooks/use-volunteer-pool';
import { flattenPoolRows, type PoolRow } from './volunteer-pool-rows';

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
const bruno = makeVolunteer({
  volunteerId: 'bruno',
  volunteerName: 'Bruno',
  status: 'no_response',
});
const carla = makeVolunteer({
  volunteerId: 'carla',
  volunteerName: 'Carla',
  status: 'unavailable',
});

function cardIds(rows: PoolRow[]): string[] {
  return rows.flatMap((row) =>
    row.kind === 'card' ? [row.volunteer.volunteerId] : [],
  );
}

describe('flattenPoolRows', () => {
  it('lists ungrouped, unfocused volunteers as bare card rows in order', () => {
    const rows = flattenPoolRows({
      groupMode: 'all',
      focusedVolunteers: null,
      otherVolunteers: [ana, bruno],
      unavailableOpen: false,
    });

    expect(rows).toEqual([
      { kind: 'card', key: 'card:all:ana', volunteer: ana },
      { kind: 'card', key: 'card:all:bruno', volunteer: bruno },
    ]);
  });

  it('splits a focused rail into Best-for-this-role and Everyone-else headers', () => {
    const rows = flattenPoolRows({
      groupMode: 'all',
      focusedVolunteers: [bruno],
      otherVolunteers: [ana],
      unavailableOpen: false,
    });

    expect(rows.map((row) => row.kind)).toEqual([
      'header',
      'card',
      'header',
      'card',
    ]);
    const [first] = rows;
    expect(first).toMatchObject({ label: 'Best for this role', icon: 'focus' });
    // Focus ranking survives flattening: the focused person leads.
    expect(cardIds(rows)).toEqual(['bruno', 'ana']);
  });

  it('keeps the "No candidates" line when the focused section is empty', () => {
    const rows = flattenPoolRows({
      groupMode: 'all',
      focusedVolunteers: [],
      otherVolunteers: [ana],
      unavailableOpen: false,
    });

    expect(rows).toContainEqual({
      kind: 'empty',
      key: 'empty:focused',
      text: 'No candidates for this role',
    });
    expect(cardIds(rows)).toEqual(['ana']);
  });

  it('omits Unavailable cards while collapsed and includes them once open', () => {
    const input = {
      groupMode: 'status' as const,
      focusedVolunteers: null,
      otherVolunteers: [ana, bruno, carla],
    };

    const collapsed = flattenPoolRows({ ...input, unavailableOpen: false });
    expect(cardIds(collapsed)).toEqual(['ana', 'bruno']);
    const trigger = collapsed.find((row) => row.kind === 'collapsible');
    expect(trigger).toMatchObject({
      label: 'Unavailable',
      count: 1,
      open: false,
    });

    const open = flattenPoolRows({ ...input, unavailableOpen: true });
    expect(cardIds(open)).toEqual(['ana', 'bruno', 'carla']);
  });

  it('duplicates a multi-role volunteer per role with a distinct drag id and row key', () => {
    const bob = makeVolunteer({
      volunteerId: 'bob',
      volunteerName: 'Bob',
      qualifiedRoleNames: ['Greeter', 'Usher'],
    });
    const rows = flattenPoolRows({
      groupMode: 'role',
      focusedVolunteers: null,
      otherVolunteers: [bob],
      unavailableOpen: false,
    });

    const cards = rows.filter((row) => row.kind === 'card');
    expect(cards).toHaveLength(2);
    expect(cards.map((row) => row.kind === 'card' && row.dragId)).toEqual([
      'role-Greeter-bob',
      'role-Usher-bob',
    ]);
    // Row keys are what the virtualizer indexes by, so the copies must differ.
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it('gives every row a unique key across a mixed grouped rail', () => {
    const rows = flattenPoolRows({
      groupMode: 'status',
      focusedVolunteers: [ana],
      otherVolunteers: [bruno, carla],
      unavailableOpen: true,
    });

    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });
});
