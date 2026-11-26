import { parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import {
  allowsAdding,
  allowsChanges,
  type ShiftVerdict,
  shiftVerdict,
} from '@/features/scheduling/utils/shift-verdict';

const currentInstant = parseInstant({ value: '2026-08-01T12:00:00.000Z' });
const future = '2026-08-01T12:00:00.001Z';
const holder = {
  volunteerId: 'ada',
  volunteerName: 'Ada',
  answerState: 'available' as const,
  conflict: null,
  qualifiedRoleIds: ['role'],
  ministryAccessLevel: 'volunteer' as const,
};

interface Case {
  name: string;
  cancelled?: boolean;
  startTime?: string;
  hasRoom?: boolean;
  holders?: boolean;
  /** Ask about the Shift as a whole. */
  wholeShift?: boolean;
  verdict: ShiftVerdict;
  changes: boolean;
  adding: boolean;
}

const open = { changes: true, adding: true };
const shut = { changes: false, adding: false };

const cases: Case[] = [
  { name: 'open requirement', verdict: 'actionable', ...open },
  { name: 'cancelled', cancelled: true, verdict: 'cancelled', ...shut },
  {
    name: 'starting this instant',
    startTime: '2026-08-01T12:00:00.000Z',
    verdict: 'started',
    ...shut,
  },
  {
    name: 'cancelled and started',
    cancelled: true,
    startTime: '2026-07-01T00:00:00.000Z',
    verdict: 'cancelled',
    ...shut,
  },
  {
    name: 'started and full',
    startTime: '2026-07-01T00:00:00.000Z',
    hasRoom: false,
    verdict: 'started',
    ...shut,
  },
  {
    name: 'full',
    hasRoom: false,
    verdict: 'full',
    changes: true,
    adding: false,
  },
  {
    name: 'full with no role holder',
    hasRoom: false,
    holders: false,
    verdict: 'full',
    changes: true,
    adding: false,
  },
  {
    name: 'no role holder',
    holders: false,
    verdict: 'no_role_holder',
    ...open,
  },
  {
    name: 'whole Shift ignores the requirement',
    wholeShift: true,
    hasRoom: false,
    holders: false,
    verdict: 'actionable',
    ...open,
  },
];

describe('shiftVerdict', () => {
  it.each(cases)('$name → $verdict', (testCase) => {
    const {
      cancelled = false,
      startTime = future,
      hasRoom = true,
      holders = true,
      wholeShift = false,
    } = testCase;
    const verdict = shiftVerdict({
      shift: {
        cancelled,
        startTime,
        eligibleVolunteers: holders ? [holder] : [],
      },
      currentInstant,
      requirement: wholeShift ? undefined : { roleId: 'role', hasRoom },
    });
    expect(verdict).toBe(testCase.verdict);
    expect(allowsChanges({ verdict })).toBe(testCase.changes);
    expect(allowsAdding({ verdict })).toBe(testCase.adding);
  });
});
