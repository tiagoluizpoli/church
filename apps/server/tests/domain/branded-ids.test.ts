import { describe, expect, it } from 'vitest';
import {
  AvailabilityId,
  EventId,
  MinistryServingProfileId,
  ParticipationSlotInclusionId,
  TeamId,
  VolunteerNotificationId,
} from '../../src/domain/branded-ids';

describe('Branded ID factories', () => {
  it.each([
    ['EventId', EventId],
    ['AvailabilityId', AvailabilityId],
    ['MinistryServingProfileId', MinistryServingProfileId],
    ['ParticipationSlotInclusionId', ParticipationSlotInclusionId],
    ['TeamId', TeamId],
    ['VolunteerNotificationId', VolunteerNotificationId],
  ])('%s.from() returns the raw string branded as the id type', (_name, brand) => {
    const raw = 'e2e11111-1111-1111-1111-111111111111';
    expect(brand.from(raw)).toBe(raw);
  });
});
