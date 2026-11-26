import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  type ChurchScopedRequestSchemas,
  NOTIFICATION_KIND_OPTIONS,
  notificationRequestDataSchemas,
} from '@/domain/notification-kinds';

describe('notification kinds', () => {
  it('keeps the retained scheduling kinds and N2, and none of the dropped ones', () => {
    expect([...NOTIFICATION_KIND_OPTIONS].sort()).toEqual([
      'availability_opened',
      'availability_reminder',
      'cycle_ready_to_prepare',
      'event_cancelled',
      'event_changed',
      'ministry_invitation',
      'schedule_published',
      'schedule_updated',
      'swap_request',
      'swap_request_answered',
    ]);
    for (const dropped of [
      'assignment_added',
      'assignment_changed',
      'assignment_removed',
      'availability_conflict',
      'assignment_reminder',
    ]) {
      expect(NOTIFICATION_KIND_OPTIONS).not.toContain(dropped);
    }
  });

  it('enqueues identifiers only, rejecting anything else', () => {
    const identity = { churchLogoUrl: null, churchAccent: '#112233' };
    const ids = {
      cycleId: '11111111-1111-4111-8111-111111111111',
      ministryId: '22222222-2222-4222-8222-222222222222',
    };

    expect(
      notificationRequestDataSchemas.availability_opened.parse({
        ...ids,
        ...identity,
      }),
    ).toEqual({ ...ids, ...identity });
    // The Church identity is required (each field nullable) on every Church kind.
    expect(() =>
      notificationRequestDataSchemas.availability_opened.parse(ids),
    ).toThrow();
    expect(() =>
      notificationRequestDataSchemas.availability_opened.parse({
        ...ids,
        ...identity,
        ministryId: 'Worship',
      }),
    ).toThrow();
    expect(() =>
      notificationRequestDataSchemas.schedule_published.parse({}),
    ).toThrow();
    // N2 names at least one led Ministry, by id only.
    expect(() =>
      notificationRequestDataSchemas.cycle_ready_to_prepare.parse({
        cycleId: ids.cycleId,
        ...identity,
        ministryIds: [],
      }),
    ).toThrow();
    expect(() =>
      notificationRequestDataSchemas.cycle_ready_to_prepare.parse({
        cycleId: ids.cycleId,
        ...identity,
        ministryIds: ['Worship'],
      }),
    ).toThrow();
  });
});

describe('Church identity on every Church-scoped kind (type-checked)', () => {
  it('refuses a kind persisted without the Church identity snapshot', () => {
    const withoutIdentity = z.object({ churchName: z.string() });
    const kind = 'swap_request';
    const schemas: ChurchScopedRequestSchemas = {
      ...notificationRequestDataSchemas,
      // @ts-expect-error: the logo URL and accent are required on every kind.
      [kind]: withoutIdentity,
    };

    expect(Object.keys(schemas)).toEqual(
      Object.keys(notificationRequestDataSchemas),
    );
  });
});
