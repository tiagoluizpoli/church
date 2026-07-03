import { describe, expect, it } from 'vitest';
import {
  PARTICIPATION_DEFAULT_ALL_IN,
  SchedulingFeatureFlagServiceStub,
  VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE,
} from '../../src/test-support/feature-flag-service-stub';
import { createNotificationServiceSpy } from '../../src/test-support/notification-service-spy';

describe('createNotificationServiceSpy', () => {
  it('records notification calls', async () => {
    const spy = createNotificationServiceSpy();
    const event = {
      type: 'event_published' as const,
      churchId: 'church-a',
      eventId: 'event-a',
      actorId: 'actor-a',
      assignmentIds: ['assignment-a'],
    };

    await spy.publish(event);

    expect(spy.publish).toHaveBeenCalledWith(event);
  });
});

describe('SchedulingFeatureFlagServiceStub', () => {
  it('returns deterministic configured values for both scheduling flags', async () => {
    const stub = new SchedulingFeatureFlagServiceStub({
      participationDefaultAllIn: true,
      volunteerDashboardAllowOverlapSave: false,
    });

    await expect(stub.isEnabled(PARTICIPATION_DEFAULT_ALL_IN)).resolves.toBe(
      true,
    );
    await expect(
      stub.isEnabled(VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE),
    ).resolves.toBe(false);
    await expect(stub.isEnabled('UNKNOWN_FLAG')).resolves.toBe(false);
  });

  it('returns all configured scheduling flags', async () => {
    const stub = new SchedulingFeatureFlagServiceStub({
      participationDefaultAllIn: false,
      volunteerDashboardAllowOverlapSave: true,
    });

    await expect(stub.getAll()).resolves.toEqual({
      [PARTICIPATION_DEFAULT_ALL_IN]: false,
      [VOLUNTEER_DASHBOARD_ALLOW_OVERLAP_SAVE]: true,
    });
  });
});
