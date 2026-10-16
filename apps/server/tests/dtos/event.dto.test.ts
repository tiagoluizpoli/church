import { isInstant, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import {
  eventMapper,
  eventResponseSchema,
  scheduleBuilderDataResponseSchema,
} from '@/api/dtos/event.dto';
import { RoleId, SectorId, VolunteerId } from '@/domain/branded-ids';
import type { ScheduleBuilderData } from '@/domain/contracts/application/event-manager';
import { Assignment } from '@/domain/entities/assignment';
import { Event } from '@/domain/entities/event';
import { EventTimeBlock } from '@/domain/entities/event-time-block';
import { ShiftRequirement } from '@/domain/entities/shift-requirement';
import { UnavailableShift } from '@/domain/entities/unavailable-shift';

const fullEventProps = {
  churchId: 'church-1',
  cycleId: 'cycle-1',
  sourceTemplateId: 'template-1',
  title: 'Sunday Service',
  description: 'Weekly gathering',
  location: 'Main Hall',
  start: parseInstant({ value: '2026-05-15T10:00:00Z' }),
  end: parseInstant({ value: '2026-05-15T12:00:00Z' }),
};

const minimalEventProps = {
  churchId: 'church-2',
  cycleId: 'cycle-2',
  title: 'Midweek Study',
  start: parseInstant({ value: '2026-05-16T10:00:00Z' }),
  end: parseInstant({ value: '2026-05-16T12:00:00Z' }),
};

describe('eventMapper.toResponse', () => {
  it('maps an event with all optional fields present', () => {
    const event = new Event(
      fullEventProps,
      'event-1',
      new Date('2026-01-01T00:00:00Z'),
      new Date('2026-01-02T00:00:00Z'),
    );

    const response = eventMapper.toResponse(event);

    expect(response).toEqual({
      id: 'event-1',
      churchId: 'church-1',
      cycleId: 'cycle-1',
      sourceTemplateId: 'template-1',
      title: 'Sunday Service',
      description: 'Weekly gathering',
      location: 'Main Hall',
      start: '2026-05-15T10:00:00.000Z',
      end: '2026-05-15T12:00:00.000Z',
      status: 'draft',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });

    expect(() => eventResponseSchema.parse(response)).not.toThrow();
    expect(isInstant({ value: response.start })).toBe(true);
    expect(isInstant({ value: response.end })).toBe(true);
    expect(isInstant({ value: response.createdAt })).toBe(true);
    expect(isInstant({ value: response.updatedAt })).toBe(true);
  });

  it('maps an event with all optional fields absent', () => {
    const event = new Event(
      minimalEventProps,
      'event-2',
      new Date('2026-01-03T00:00:00Z'),
      new Date('2026-01-03T00:00:00Z'),
    );

    const response = eventMapper.toResponse(event);

    expect(response).toEqual({
      id: 'event-2',
      churchId: 'church-2',
      cycleId: 'cycle-2',
      sourceTemplateId: undefined,
      title: 'Midweek Study',
      description: undefined,
      location: undefined,
      start: '2026-05-16T10:00:00.000Z',
      end: '2026-05-16T12:00:00.000Z',
      status: 'draft',
      createdAt: '2026-01-03T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    });
  });
});

describe('eventMapper.listToResponse', () => {
  it('returns an empty events array for an empty input', () => {
    expect(eventMapper.listToResponse([])).toEqual({ events: [] });
  });

  it('maps multiple events preserving order', () => {
    const eventA = new Event(fullEventProps, 'event-a');
    const eventB = new Event(minimalEventProps, 'event-b');

    const response = eventMapper.listToResponse([eventA, eventB]);

    expect(response.events).toHaveLength(2);
    expect(response.events[0]?.id).toBe('event-a');
    expect(response.events[1]?.id).toBe('event-b');
  });
});

describe('eventMapper.scheduleBuilderToResponse', () => {
  it('maps a fully populated schedule builder payload', () => {
    const event = new Event(fullEventProps, 'event-1');

    const requirementWithExtras = new ShiftRequirement(
      {
        churchId: 'church-1',
        eventTimeBlockId: 'event-time-block-1',
        roleId: 'role-1',
        sectorId: 'sector-1',
        peopleNeeded: 2,
        notes: 'Bring instruments',
      },
      'req-1',
    );
    const requirementWithoutExtras = new ShiftRequirement(
      {
        churchId: 'church-1',
        eventTimeBlockId: 'event-time-block-1',
        roleId: 'role-2',
        sectorId: 'sector-1',
        peopleNeeded: 1,
      },
      'req-2',
    );

    const eventTimeBlock = new EventTimeBlock(
      {
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: parseInstant({ value: '2026-05-15T10:00:00Z' }),
        endTime: parseInstant({ value: '2026-05-15T11:00:00Z' }),
        label: 'Worship Set',
        requirements: [requirementWithExtras, requirementWithoutExtras],
      },
      'event-time-block-1',
    );

    const assignmentWithExtras = new Assignment(
      {
        churchId: 'church-1',
        eventTimeBlockId: 'event-time-block-1',
        participationId: 'participation-1',
        shiftId: 'shift-1',
        volunteerId: 'volunteer-1',
        roleId: 'role-1',
        reason: 'Volunteered',
        assignedBy: 'user-1',
        assignedAt: parseInstant({ value: '2026-01-10T00:00:00Z' }),
      },
      'assignment-1',
    );
    const assignmentWithoutExtras = new Assignment(
      {
        churchId: 'church-1',
        eventTimeBlockId: 'event-time-block-1',
        volunteerId: 'volunteer-2',
        roleId: 'role-2',
        assignedAt: parseInstant({ value: '2026-01-11T00:00:00Z' }),
      },
      'assignment-2',
    );

    const unavailableShift = new UnavailableShift({
      props: {
        churchId: 'church-1',
        availabilityCheckId: 'check-1',
        shiftId: 'shift-1',
        volunteerId: 'volunteer-1',
        shiftStartTime: parseInstant({ value: '2026-05-15T10:00:00Z' }),
        shiftEndTime: parseInstant({ value: '2026-05-15T11:00:00Z' }),
      },
      id: 'availability-1',
    });

    const data: ScheduleBuilderData = {
      events: [{ event, eventTimeBlocks: [eventTimeBlock] }],
      assignments: [assignmentWithExtras, assignmentWithoutExtras],
      unavailableShifts: [unavailableShift],
      volunteers: [
        {
          id: VolunteerId.from('volunteer-1'),
          name: 'Alice',
          ministryAccessLevel: 'leader',
          qualifiedRoleIds: ['role-1', 'role-2'],
        },
        {
          id: VolunteerId.from('volunteer-2'),
          name: 'Bob',
          ministryAccessLevel: 'volunteer',
          qualifiedRoleIds: [],
        },
      ],
      roles: [
        { id: RoleId.from('role-1'), name: 'Vocalist' },
        { id: RoleId.from('role-2'), name: 'Sound Tech' },
      ],
      sectors: [{ id: SectorId.from('sector-1'), name: 'Stage' }],
    };

    const response = eventMapper.scheduleBuilderToResponse(data);

    expect(response.events).toHaveLength(1);
    expect(response.events[0]?.event.id).toBe('event-1');
    expect(response.events[0]?.eventTimeBlocks).toHaveLength(1);

    const mappedEventTimeBlock = response.events[0]?.eventTimeBlocks[0];
    expect(mappedEventTimeBlock).toMatchObject({
      id: 'event-time-block-1',
      churchId: 'church-1',
      eventId: 'event-1',
      startTime: '2026-05-15T10:00:00.000Z',
      endTime: '2026-05-15T11:00:00.000Z',
      label: 'Worship Set',
      status: 'active',
    });
    expect(mappedEventTimeBlock?.requirements).toEqual([
      {
        id: 'req-1',
        eventTimeBlockId: 'event-time-block-1',
        roleId: 'role-1',
        sectorId: 'sector-1',
        peopleNeeded: 2,
        notes: 'Bring instruments',
      },
      {
        id: 'req-2',
        eventTimeBlockId: 'event-time-block-1',
        roleId: 'role-2',
        sectorId: 'sector-1',
        peopleNeeded: 1,
        notes: undefined,
      },
    ]);

    expect(response.assignments).toEqual([
      {
        id: 'assignment-1',
        churchId: 'church-1',
        eventTimeBlockId: 'event-time-block-1',
        participationId: 'participation-1',
        shiftId: 'shift-1',
        volunteerId: 'volunteer-1',
        roleId: 'role-1',
        status: 'draft',
        reason: 'Volunteered',
        assignedAt: '2026-01-10T00:00:00.000Z',
        assignedBy: 'user-1',
      },
      {
        id: 'assignment-2',
        churchId: 'church-1',
        eventTimeBlockId: 'event-time-block-1',
        participationId: undefined,
        shiftId: undefined,
        volunteerId: 'volunteer-2',
        roleId: 'role-2',
        status: 'draft',
        reason: undefined,
        assignedAt: '2026-01-11T00:00:00.000Z',
        assignedBy: undefined,
      },
    ]);

    expect(response.unavailableShifts).toEqual([
      {
        id: 'availability-1',
        volunteerId: 'volunteer-1',
        type: 'unavailable',
        startTime: '2026-05-15T10:00:00.000Z',
        endTime: '2026-05-15T11:00:00.000Z',
        isAllDay: false,
      },
    ]);

    expect(response.volunteers).toEqual([
      {
        id: 'volunteer-1',
        name: 'Alice',
        ministryAccessLevel: 'leader',
        qualifiedRoleIds: ['role-1', 'role-2'],
      },
      {
        id: 'volunteer-2',
        name: 'Bob',
        ministryAccessLevel: 'volunteer',
        qualifiedRoleIds: [],
      },
    ]);

    // The response must satisfy the published contract, not just the mapper's
    // inferred shape — the generated client schema is derived from it.
    expect(() =>
      scheduleBuilderDataResponseSchema.parse(response),
    ).not.toThrow();
    expect(
      isInstant({ value: response.assignments[0]?.assignedAt ?? '' }),
    ).toBe(true);
    expect(
      isInstant({ value: response.unavailableShifts[0]?.startTime ?? '' }),
    ).toBe(true);

    expect(response.roles).toEqual([
      { id: 'role-1', name: 'Vocalist' },
      { id: 'role-2', name: 'Sound Tech' },
    ]);

    expect(response.sectors).toEqual([{ id: 'sector-1', name: 'Stage' }]);
  });

  it('maps an all-empty schedule builder payload', () => {
    const data: ScheduleBuilderData = {
      events: [],
      assignments: [],
      unavailableShifts: [],
      volunteers: [],
      roles: [],
      sectors: [],
    };

    const response = eventMapper.scheduleBuilderToResponse(data);

    expect(response).toEqual({
      events: [],
      assignments: [],
      unavailableShifts: [],
      volunteers: [],
      roles: [],
      sectors: [],
    });
  });

  it('maps an event with event time blocks that have no requirements', () => {
    const event = new Event(minimalEventProps, 'event-2');
    const eventTimeBlock = new EventTimeBlock(
      {
        churchId: 'church-2',
        eventId: 'event-2',
        startTime: parseInstant({ value: '2026-05-16T10:00:00Z' }),
        endTime: parseInstant({ value: '2026-05-16T11:00:00Z' }),
      },
      'event-time-block-2',
    );

    const data: ScheduleBuilderData = {
      events: [{ event, eventTimeBlocks: [eventTimeBlock] }],
      assignments: [],
      unavailableShifts: [],
      volunteers: [],
      roles: [],
      sectors: [],
    };

    const response = eventMapper.scheduleBuilderToResponse(data);

    expect(response.events[0]?.eventTimeBlocks[0]?.requirements).toEqual([]);
    expect(response.events[0]?.eventTimeBlocks[0]?.label).toBeUndefined();
  });
});
