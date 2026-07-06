import { describe, expect, it } from 'vitest';
import { eventMapper } from '../../src/api/dtos/event.dto';
import { RoleId, VolunteerId } from '../../src/domain/branded-ids';
import type { ScheduleBuilderData } from '../../src/domain/contracts/application/event-manager';
import { Assignment } from '../../src/domain/entities/assignment';
import { Availability } from '../../src/domain/entities/availability';
import { Event } from '../../src/domain/entities/event';
import { SlotRequirement } from '../../src/domain/entities/slot-requirement';
import { TimeSlot } from '../../src/domain/entities/time-slot';

const fullEventProps = {
  churchId: 'church-1',
  planningCycleId: 'cycle-1',
  sourceTemplateId: 'template-1',
  title: 'Sunday Service',
  description: 'Weekly gathering',
  location: 'Main Hall',
  startDate: new Date('2026-05-15T10:00:00Z'),
  endDate: new Date('2026-05-15T12:00:00Z'),
};

const minimalEventProps = {
  churchId: 'church-2',
  planningCycleId: 'cycle-2',
  title: 'Midweek Study',
  startDate: new Date('2026-05-16T10:00:00Z'),
  endDate: new Date('2026-05-16T12:00:00Z'),
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
      planningCycleId: 'cycle-1',
      sourceTemplateId: 'template-1',
      title: 'Sunday Service',
      description: 'Weekly gathering',
      location: 'Main Hall',
      startDate: '2026-05-15T10:00:00.000Z',
      endDate: '2026-05-15T12:00:00.000Z',
      status: 'draft',
      eventType: 'hourly',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
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
      planningCycleId: 'cycle-2',
      sourceTemplateId: undefined,
      title: 'Midweek Study',
      description: undefined,
      location: undefined,
      startDate: '2026-05-16T10:00:00.000Z',
      endDate: '2026-05-16T12:00:00.000Z',
      status: 'draft',
      eventType: 'hourly',
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

    const requirementWithExtras = new SlotRequirement(
      {
        churchId: 'church-1',
        slotId: 'slot-1',
        roleId: 'role-1',
        teamId: 'team-1',
        requiredCount: 2,
        notes: 'Bring instruments',
      },
      'req-1',
    );
    const requirementWithoutExtras = new SlotRequirement(
      {
        churchId: 'church-1',
        slotId: 'slot-1',
        roleId: 'role-2',
        requiredCount: 1,
      },
      'req-2',
    );

    const slot = new TimeSlot(
      {
        churchId: 'church-1',
        eventId: 'event-1',
        startTime: new Date('2026-05-15T10:00:00Z'),
        endTime: new Date('2026-05-15T11:00:00Z'),
        label: 'Worship Set',
        requirements: [requirementWithExtras, requirementWithoutExtras],
      },
      'slot-1',
    );

    const assignmentWithExtras = new Assignment(
      {
        churchId: 'church-1',
        slotId: 'slot-1',
        participationId: 'participation-1',
        shiftId: 'shift-1',
        volunteerId: 'volunteer-1',
        roleId: 'role-1',
        reason: 'Volunteered',
        assignedBy: 'user-1',
        assignedAt: new Date('2026-01-10T00:00:00Z'),
      },
      'assignment-1',
    );
    const assignmentWithoutExtras = new Assignment(
      {
        churchId: 'church-1',
        slotId: 'slot-1',
        volunteerId: 'volunteer-2',
        roleId: 'role-2',
        assignedAt: new Date('2026-01-11T00:00:00Z'),
      },
      'assignment-2',
    );

    const availabilityMark = new Availability({
      props: {
        churchId: 'church-1',
        availabilityCheckId: 'check-1',
        shiftId: 'shift-1',
        volunteerId: 'volunteer-1',
        shiftStartTime: new Date('2026-05-15T10:00:00Z'),
        shiftEndTime: new Date('2026-05-15T11:00:00Z'),
      },
      id: 'availability-1',
    });

    const data: ScheduleBuilderData = {
      events: [{ event, slots: [slot] }],
      assignments: [assignmentWithExtras, assignmentWithoutExtras],
      availability: [availabilityMark],
      volunteers: [
        {
          id: VolunteerId.from('volunteer-1'),
          name: 'Alice',
          systemRole: 'leader',
        },
        {
          id: VolunteerId.from('volunteer-2'),
          name: 'Bob',
          systemRole: 'volunteer',
        },
      ],
      roles: [
        { id: RoleId.from('role-1'), name: 'Vocalist' },
        { id: RoleId.from('role-2'), name: 'Sound Tech' },
      ],
      callerTeamId: 'team-1',
    };

    const response = eventMapper.scheduleBuilderToResponse(data);

    expect(response.events).toHaveLength(1);
    expect(response.events[0]?.event.id).toBe('event-1');
    expect(response.events[0]?.slots).toHaveLength(1);

    const mappedSlot = response.events[0]?.slots[0];
    expect(mappedSlot).toMatchObject({
      id: 'slot-1',
      churchId: 'church-1',
      eventId: 'event-1',
      startTime: '2026-05-15T10:00:00.000Z',
      endTime: '2026-05-15T11:00:00.000Z',
      label: 'Worship Set',
      status: 'active',
    });
    expect(mappedSlot?.requirements).toEqual([
      {
        id: 'req-1',
        slotId: 'slot-1',
        roleId: 'role-1',
        teamId: 'team-1',
        requiredCount: 2,
        notes: 'Bring instruments',
      },
      {
        id: 'req-2',
        slotId: 'slot-1',
        roleId: 'role-2',
        teamId: undefined,
        requiredCount: 1,
        notes: undefined,
      },
    ]);

    expect(response.assignments).toEqual([
      {
        id: 'assignment-1',
        churchId: 'church-1',
        slotId: 'slot-1',
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
        slotId: 'slot-1',
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

    expect(response.availability).toEqual([
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
      { id: 'volunteer-1', name: 'Alice', systemRole: 'leader' },
      { id: 'volunteer-2', name: 'Bob', systemRole: 'volunteer' },
    ]);

    expect(response.roles).toEqual([
      { id: 'role-1', name: 'Vocalist' },
      { id: 'role-2', name: 'Sound Tech' },
    ]);

    expect(response.callerTeamId).toBe('team-1');
  });

  it('maps an all-empty schedule builder payload with a null callerTeamId', () => {
    const data: ScheduleBuilderData = {
      events: [],
      assignments: [],
      availability: [],
      volunteers: [],
      roles: [],
      callerTeamId: null,
    };

    const response = eventMapper.scheduleBuilderToResponse(data);

    expect(response).toEqual({
      events: [],
      assignments: [],
      availability: [],
      volunteers: [],
      roles: [],
      callerTeamId: null,
    });
  });

  it('maps an event with slots that have no requirements', () => {
    const event = new Event(minimalEventProps, 'event-2');
    const slot = new TimeSlot(
      {
        churchId: 'church-2',
        eventId: 'event-2',
        startTime: new Date('2026-05-16T10:00:00Z'),
        endTime: new Date('2026-05-16T11:00:00Z'),
      },
      'slot-2',
    );

    const data: ScheduleBuilderData = {
      events: [{ event, slots: [slot] }],
      assignments: [],
      availability: [],
      volunteers: [],
      roles: [],
      callerTeamId: null,
    };

    const response = eventMapper.scheduleBuilderToResponse(data);

    expect(response.events[0]?.slots[0]?.requirements).toEqual([]);
    expect(response.events[0]?.slots[0]?.label).toBeUndefined();
  });
});
