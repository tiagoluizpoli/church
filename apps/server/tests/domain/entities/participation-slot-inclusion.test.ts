import { describe, expect, it } from 'vitest';
import type {
  ChurchId,
  MinistryParticipationId,
  TimeSlotId,
} from '../../../src/domain/branded-ids';
import { ParticipationSlotInclusion } from '../../../src/domain/entities/participation-slot-inclusion';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const participationId =
  '22222222-2222-4222-8222-222222222222' as MinistryParticipationId;
const timeSlotId = '33333333-3333-4333-8333-333333333333' as TimeSlotId;

describe('ParticipationSlotInclusion entity', () => {
  it('exposes its scoping identifiers', () => {
    const inclusion = new ParticipationSlotInclusion({
      props: { churchId, participationId, timeSlotId },
      id: '44444444-4444-4444-8444-444444444444',
    });

    expect(inclusion.churchId).toBe(churchId);
    expect(inclusion.participationId).toBe(participationId);
    expect(inclusion.timeSlotId).toBe(timeSlotId);
    expect(inclusion.id).toBe('44444444-4444-4444-8444-444444444444');
  });
});
