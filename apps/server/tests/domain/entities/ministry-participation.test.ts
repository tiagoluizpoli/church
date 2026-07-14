import { describe, expect, it } from 'vitest';
import type {
  ChurchId,
  EventId,
  MinistryId,
} from '../../../src/domain/branded-ids';
import {
  aggregateCycleTailoringStatus,
  calculateCompletionPercent,
  MinistryParticipation,
} from '../../../src/domain/entities/ministry-participation';
import {
  BelowFullPublishError,
  IllegalStateTransitionError,
} from '../../../src/domain/errors';

const churchId = '11111111-1111-4111-8111-111111111111' as ChurchId;
const ministryId = '33333333-3333-4333-8333-333333333331' as MinistryId;
const eventId = '99999999-9999-4999-8999-999999999999' as EventId;

interface BuildParticipationInput {
  state?: 'tailoring' | 'availability_fired' | 'rostering' | 'published';
}

function buildParticipation({
  state,
}: BuildParticipationInput = {}): MinistryParticipation {
  return new MinistryParticipation({
    props: {
      churchId,
      ministryId,
      eventId,
      state,
    },
  });
}

describe('MinistryParticipation lifecycle (DL1-MP)', () => {
  it('DL1-MP-01 defaults to tailoring state', () => {
    const participation = buildParticipation();

    expect(participation.state).toBe('tailoring');
    expect(participation.churchId).toBe(churchId);
    expect(participation.ministryId).toBe(ministryId);
    expect(participation.eventId).toBe(eventId);
  });

  it('DL1-MP-02 transitions in order tailoring→availability_fired→rostering→published', () => {
    const participation = buildParticipation();

    participation.fireAvailability();
    expect(participation.state).toBe('availability_fired');

    participation.startRostering();
    expect(participation.state).toBe('rostering');

    participation.publish({ completionPercent: 100 });
    expect(participation.state).toBe('published');
  });

  it('DL1-MP-03 rejects skipped transitions', () => {
    const participation = buildParticipation();

    expect(() => participation.publish({ completionPercent: 100 })).toThrow(
      IllegalStateTransitionError,
    );
    expect(() => participation.startRostering()).toThrow(
      IllegalStateTransitionError,
    );
  });

  it('DL1-MP-04 rejects re-firing from published', () => {
    const participation = buildParticipation({ state: 'published' });

    expect(() => participation.fireAvailability()).toThrow(
      IllegalStateTransitionError,
    );
  });

  it('DL1-MP-05 computes completion percent; zero required means 100% (CL-022)', () => {
    expect(
      calculateCompletionPercent({ assignedCount: 3, requiredCount: 4 }),
    ).toBe(75);
    expect(
      calculateCompletionPercent({ assignedCount: 0, requiredCount: 5 }),
    ).toBe(0);
    expect(
      calculateCompletionPercent({ assignedCount: 5, requiredCount: 5 }),
    ).toBe(100);
    expect(
      calculateCompletionPercent({ assignedCount: 0, requiredCount: 0 }),
    ).toBe(100);
    expect(
      calculateCompletionPercent({ assignedCount: 7, requiredCount: 5 }),
    ).toBe(100);
  });

  it('DL1-MP-06 publish below 100% requires the explicit confirm flag', () => {
    const blocked = buildParticipation({ state: 'rostering' });

    expect(() => blocked.publish({ completionPercent: 80 })).toThrow(
      BelowFullPublishError,
    );
    expect(blocked.state).toBe('rostering');

    const confirmed = buildParticipation({ state: 'rostering' });
    confirmed.publish({ completionPercent: 80, confirmBelowFull: true });
    expect(confirmed.state).toBe('published');
  });

  it('DL1-MP-07 publish mutates only its own state', () => {
    const publishing = buildParticipation({ state: 'rostering' });
    const sibling = buildParticipation({ state: 'tailoring' });

    publishing.publish({ completionPercent: 100 });

    expect(publishing.state).toBe('published');
    expect(sibling.state).toBe('tailoring');
  });

  it('DL1-MP-08 touch() sets touchedAt on first call and is a no-op afterward', () => {
    const participation = buildParticipation();
    expect(participation.touchedAt).toBeNull();

    participation.touch();
    const firstTouchedAt = participation.touchedAt;
    expect(firstTouchedAt).not.toBeNull();

    participation.touch();
    expect(participation.touchedAt).toBe(firstTouchedAt);
  });
});

describe('aggregateCycleTailoringStatus (R16)', () => {
  it('reads "not started" when eventCount is 0, never vacuously "published"', () => {
    expect(
      aggregateCycleTailoringStatus({
        eventCount: 0,
        touchedCount: 0,
        publishedCount: 0,
        firedOrLaterCount: 0,
      }),
    ).toEqual({ status: 'not_started', availabilityFiredForAll: false });
  });

  it('reads "not started" when no participation has been touched', () => {
    expect(
      aggregateCycleTailoringStatus({
        eventCount: 3,
        touchedCount: 0,
        publishedCount: 0,
        firedOrLaterCount: 0,
      }),
    ).toEqual({ status: 'not_started', availabilityFiredForAll: false });
  });

  it('reads "in progress" when some but not all participations are touched/published', () => {
    expect(
      aggregateCycleTailoringStatus({
        eventCount: 3,
        touchedCount: 1,
        publishedCount: 0,
        firedOrLaterCount: 1,
      }).status,
    ).toBe('in_progress');

    expect(
      aggregateCycleTailoringStatus({
        eventCount: 3,
        touchedCount: 3,
        publishedCount: 2,
        firedOrLaterCount: 3,
      }).status,
    ).toBe('in_progress');
  });

  it('reads "published" only when every participation is published', () => {
    expect(
      aggregateCycleTailoringStatus({
        eventCount: 3,
        touchedCount: 3,
        publishedCount: 3,
        firedOrLaterCount: 3,
      }).status,
    ).toBe('published');
  });

  it('reads "published" even when touchedCount is 0 — a zero-requirement event can reach published via fireAvailability/startRostering/publish without ever calling touch()', () => {
    expect(
      aggregateCycleTailoringStatus({
        eventCount: 2,
        touchedCount: 0,
        publishedCount: 2,
        firedOrLaterCount: 2,
      }).status,
    ).toBe('published');
  });

  it('availabilityFiredForAll is true only when every participation has moved past tailoring, independent of the published status boundary', () => {
    expect(
      aggregateCycleTailoringStatus({
        eventCount: 2,
        touchedCount: 2,
        publishedCount: 0,
        firedOrLaterCount: 2,
      }).availabilityFiredForAll,
    ).toBe(true);

    expect(
      aggregateCycleTailoringStatus({
        eventCount: 2,
        touchedCount: 2,
        publishedCount: 0,
        firedOrLaterCount: 1,
      }).availabilityFiredForAll,
    ).toBe(false);
  });
});
