import { describe, expect, it } from 'vitest';
import type {
  ChurchId,
  EventTimeBlockId,
  MinistryParticipationId,
} from '@/domain/branded-ids';
import { ParticipationEventTimeBlockInclusion } from '@/domain/entities/participation-event-time-block-inclusion';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const participationId =
  '22222222-2222-4222-8222-222222222222' as MinistryParticipationId;
const eventTimeBlockId =
  '33333333-3333-4333-8333-333333333333' as EventTimeBlockId;

describe('ParticipationEventTimeBlockInclusion entity', () => {
  it('exposes its scoping identifiers', () => {
    const inclusion = new ParticipationEventTimeBlockInclusion({
      props: { churchId, participationId, eventTimeBlockId },
      id: '44444444-4444-4444-8444-444444444444',
    });

    expect(inclusion.churchId).toBe(churchId);
    expect(inclusion.participationId).toBe(participationId);
    expect(inclusion.eventTimeBlockId).toBe(eventTimeBlockId);
    expect(inclusion.id).toBe('44444444-4444-4444-8444-444444444444');
  });
});
