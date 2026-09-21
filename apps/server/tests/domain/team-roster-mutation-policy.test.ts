import { parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import { TeamRosterMutationPolicy } from '../../src/domain/authority/team-roster-mutation-policy';
import type { TeamId } from '../../src/domain/branded-ids';

const ledTeamId = 'team-led' as TeamId;
const otherTeamId = 'team-other' as TeamId;
const futureStart = parseInstant({ value: '2026-10-04T09:00:00.000Z' });
const now = parseInstant({ value: '2026-09-20T00:00:00.000Z' });

interface AuthorizeOverrides {
  participationState?:
    | 'tailoring'
    | 'availability_fired'
    | 'rostering'
    | 'published';
  eventStatus?: 'draft' | 'scheduled' | 'cancelled' | 'past';
  eventStart?: typeof futureStart;
  requirementTeamIds?: Array<TeamId | undefined>;
  volunteerTeamIds?: TeamId[];
}

function authorize(overrides: AuthorizeOverrides = {}): boolean {
  return TeamRosterMutationPolicy.authorize({
    teamId: ledTeamId,
    participationState: 'rostering',
    eventStatus: 'scheduled',
    eventStart: futureStart,
    now,
    requirementTeamIds: [ledTeamId],
    volunteerTeamIds: [ledTeamId],
    ...overrides,
  });
}

describe('TeamRosterMutationPolicy', () => {
  it('allows an unambiguous led-Team assignment in a future rostering participation', () => {
    expect(authorize()).toBe(true);
  });

  it.each([
    {
      name: 'published participation',
      overrides: { participationState: 'published' as const },
    },
    {
      name: 'past Event status',
      overrides: { eventStatus: 'past' as const },
    },
    {
      name: 'Event whose start is no longer future',
      overrides: { eventStart: now },
    },
    {
      name: 'another Team requirement',
      overrides: { requirementTeamIds: [otherTeamId] },
    },
    {
      name: 'non-Team requirement',
      overrides: { requirementTeamIds: [undefined] },
    },
    {
      name: 'ambiguous same-role requirements',
      overrides: { requirementTeamIds: [ledTeamId, otherTeamId] },
    },
    {
      name: 'Volunteer outside the led Team',
      overrides: { volunteerTeamIds: [otherTeamId] },
    },
  ])('denies $name', ({ overrides }) => {
    expect(authorize(overrides)).toBe(false);
  });
});
