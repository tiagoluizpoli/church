import { describe, expect, it } from 'vitest';
import { parseLastJsonLine } from './e2e-target';
import {
  journeyKeyOf,
  VOLUNTEER_ASSIGNMENTS_JOURNEY_SCHEMA as schema,
} from './journey-recipes';

const PREFLIGHT =
  'purpose=e2e worktree=unspecified host=localhost port=5432 database=church_unspecified_e2e';
const JOURNEY = {
  anchor: '2026-10-02',
  church: { id: 'c1', slug: 'journey-church' },
  volunteer: {
    userId: 'u1',
    email: 'v@test.com',
    password: 'pw',
    name: 'Journey Volunteer',
    volunteerId: 'v1',
  },
  assignment: {
    id: 'a1',
    eventId: 'e1',
    eventTitle: 'Sunday Service',
    ministryName: 'Worship',
    roleName: 'Vocals',
    startsAt: '2026-10-09T13:00:00.000Z',
    endsAt: '2026-10-09T15:00:00.000Z',
  },
};

describe('journey recipes', () => {
  it('derives a key per test and repeat index', () => {
    expect(journeyKeyOf({ testId: 'abc-1', repeatEachIndex: 0 })).toBe(
      'abc-1-0',
    );
    expect(journeyKeyOf({ testId: 'abc-1', repeatEachIndex: 2 })).toBe(
      'abc-1-2',
    );
  });

  it('parses the last JSON line after the preflight line', () => {
    const output = `${PREFLIGHT}\n${JSON.stringify(JOURNEY)}\n`;

    expect(parseLastJsonLine({ output, schema })).toEqual(JOURNEY);
  });

  it('rejects output that breaks the contract', () => {
    const { volunteer: _volunteer, ...incomplete } = JOURNEY;
    const output = `${PREFLIGHT}\n${JSON.stringify(incomplete)}\n`;

    expect(() => parseLastJsonLine({ output, schema })).toThrow();
  });
});
