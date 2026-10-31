import { describe, expect, it } from 'vitest';
import {
  EventId,
  ParticipationEventTimeBlockInclusionId,
  TeamId,
  UnavailableShiftId,
  UsualSetupId,
} from '@/domain/branded-ids';

describe('Branded ID factories', () => {
  it.each([
    ['EventId', EventId],
    ['UnavailableShiftId', UnavailableShiftId],
    ['UsualSetupId', UsualSetupId],
    [
      'ParticipationEventTimeBlockInclusionId',
      ParticipationEventTimeBlockInclusionId,
    ],
    ['TeamId', TeamId],
  ])('%s.from() returns the raw string branded as the id type', (_name, brand) => {
    const raw = 'e2e11111-1111-1111-a111-111111111111';
    expect(brand.from(raw)).toBe(raw);
  });
});
