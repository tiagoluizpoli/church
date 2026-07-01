import { describe, expect, it } from 'vitest';
import type { ScheduleBuilderData } from '../../hooks/use-schedule-builder';
import { buildCreateSlotInitialValues } from './use-slot-management';

const builderData = {
  event: {
    id: 'event-1',
    title: 'Sunday Service',
    startDate: '2026-07-01T08:30:00.000Z',
    endDate: '2026-07-01T10:30:00.000Z',
    ministryId: 'ministry-1',
    status: 'draft',
    eventType: 'hourly',
  },
  roles: [],
  slots: [],
  requirements: [],
  assignments: [],
  volunteerAvailability: [],
  callerTeamId: null,
} as unknown as ScheduleBuilderData;

describe('buildCreateSlotInitialValues', () => {
  it('defaults a new slot to the full event window', () => {
    expect(buildCreateSlotInitialValues(builderData)).toEqual({
      startTime: '2026-07-01T08:30:00.000Z',
      endTime: '2026-07-01T10:30:00.000Z',
      label: undefined,
    });
  });
});
