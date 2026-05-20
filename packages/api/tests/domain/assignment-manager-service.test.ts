import { describe, expect, it } from 'vitest';
import { AssignmentManagerService } from '../../src/domain/assignment/assignment-manager-service';
import {
  DuplicateSlotsError,
  EmptyScheduleError,
  InvalidStateTransitionError,
  PublishValidationError,
} from '../../src/domain/assignment/errors';
import { Assignment } from '../../src/domain/entities/assignment';
import { Event } from '../../src/domain/entities/event';
import { TimeSlot } from '../../src/domain/entities/time-slot';

describe('Slot Generation — Equal Split', () => {
  const churchId = 'church-1';
  const eventId = 'event-1';

  it('even division (120min / 30min = 4 slots) — 4 non-overlapping slots', () => {
    const eventStartTime = new Date('2026-05-19T10:00:00Z');
    const eventEndTime = new Date('2026-05-19T12:00:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId,
      eventId,
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'equal-split',
        slotDurationMinutes: 30,
      },
    });

    expect(result.totalCount).toBe(4);
    expect(result.hasRemainder).toBe(false);
    expect(result.slots).toHaveLength(4);

    // Check that slots are sequential and non-overlapping
    result.slots.forEach((generated, i) => {
      const slot = generated.slot;
      expect(slot.churchId).toBe(churchId);
      expect(slot.eventId).toBe(eventId);
      expect(slot.status).toBe('active');
      expect(slot.label).toBe(`Slot ${i + 1}`);

      const expectedStart = new Date(
        eventStartTime.getTime() + i * 30 * 60 * 1000,
      );
      const expectedEnd = new Date(expectedStart.getTime() + 30 * 60 * 1000);
      expect(slot.startTime.getTime()).toBe(expectedStart.getTime());
      expect(slot.endTime.getTime()).toBe(expectedEnd.getTime());
    });
  });

  it('remainder (65min / 30min) — 2x30min + 1x5min = 3 slots, hasRemainder: true', () => {
    const eventStartTime = new Date('2026-05-19T10:00:00Z');
    const eventEndTime = new Date('2026-05-19T11:05:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId,
      eventId,
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'equal-split',
        slotDurationMinutes: 30,
      },
    });

    expect(result.totalCount).toBe(3);
    expect(result.hasRemainder).toBe(true);
    expect(result.slots).toHaveLength(3);

    const slot0 = result.slots[0];
    const slot1 = result.slots[1];
    const slot2 = result.slots[2];

    expect(slot0).toBeDefined();
    expect(slot1).toBeDefined();
    expect(slot2).toBeDefined();

    if (slot0) {
      expect(slot0.slot.startTime.getTime()).toBe(eventStartTime.getTime());
      expect(slot0.slot.endTime.getTime()).toBe(
        new Date('2026-05-19T10:30:00Z').getTime(),
      );
    }

    if (slot1) {
      expect(slot1.slot.startTime.getTime()).toBe(
        new Date('2026-05-19T10:30:00Z').getTime(),
      );
      expect(slot1.slot.endTime.getTime()).toBe(
        new Date('2026-05-19T11:00:00Z').getTime(),
      );
    }

    if (slot2) {
      expect(slot2.slot.startTime.getTime()).toBe(
        new Date('2026-05-19T11:00:00Z').getTime(),
      );
      expect(slot2.slot.endTime.getTime()).toBe(eventEndTime.getTime());
    }
  });

  it('single slot (30min / 30min = 1 slot)', () => {
    const eventStartTime = new Date('2026-05-19T10:00:00Z');
    const eventEndTime = new Date('2026-05-19T10:30:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId,
      eventId,
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'equal-split',
        slotDurationMinutes: 30,
      },
    });

    expect(result.totalCount).toBe(1);
    expect(result.hasRemainder).toBe(false);

    const slot0 = result.slots[0];
    expect(slot0).toBeDefined();
    if (slot0) {
      expect(slot0.slot.startTime.getTime()).toBe(eventStartTime.getTime());
      expect(slot0.slot.endTime.getTime()).toBe(eventEndTime.getTime());
    }
  });

  it('slot duration exceeds event duration — 1 slot = full event', () => {
    const eventStartTime = new Date('2026-05-19T10:00:00Z');
    const eventEndTime = new Date('2026-05-19T10:30:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId,
      eventId,
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'equal-split',
        slotDurationMinutes: 60,
      },
    });

    expect(result.totalCount).toBe(1);
    expect(result.hasRemainder).toBe(true);

    const slot0 = result.slots[0];
    expect(slot0).toBeDefined();
    if (slot0) {
      expect(slot0.slot.startTime.getTime()).toBe(eventStartTime.getTime());
      expect(slot0.slot.endTime.getTime()).toBe(eventEndTime.getTime());
    }
  });

  it('very small remainder (61min / 30min) — 2x30min + 1x1min', () => {
    const eventStartTime = new Date('2026-05-19T10:00:00Z');
    const eventEndTime = new Date('2026-05-19T11:01:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId,
      eventId,
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'equal-split',
        slotDurationMinutes: 30,
      },
    });

    expect(result.totalCount).toBe(3);
    expect(result.hasRemainder).toBe(true);

    const slot2 = result.slots[2];
    expect(slot2).toBeDefined();
    if (slot2) {
      expect(slot2.slot.startTime.getTime()).toBe(
        new Date('2026-05-19T11:00:00Z').getTime(),
      );
      expect(slot2.slot.endTime.getTime()).toBe(eventEndTime.getTime());
    }
  });

  it('zero-duration slot request → domain error', () => {
    const eventStartTime = new Date('2026-05-19T10:00:00Z');
    const eventEndTime = new Date('2026-05-19T12:00:00Z');

    expect(() => {
      AssignmentManagerService.generateSlots({
        churchId,
        eventId,
        eventStartTime,
        eventEndTime,
        strategy: {
          kind: 'equal-split',
          slotDurationMinutes: 0,
        },
      });
    }).toThrow();
  });

  it('negative slot duration → domain error', () => {
    const eventStartTime = new Date('2026-05-19T10:00:00Z');
    const eventEndTime = new Date('2026-05-19T12:00:00Z');

    expect(() => {
      AssignmentManagerService.generateSlots({
        churchId,
        eventId,
        eventStartTime,
        eventEndTime,
        strategy: {
          kind: 'equal-split',
          slotDurationMinutes: -10,
        },
      });
    }).toThrow();
  });

  it('event already has existing slots → DuplicateSlotsError', () => {
    const eventStartTime = new Date('2026-05-19T10:00:00Z');
    const eventEndTime = new Date('2026-05-19T12:00:00Z');
    const existingSlot = new TimeSlot({
      churchId,
      eventId,
      startTime: eventStartTime,
      endTime: eventEndTime,
    });

    expect(() => {
      AssignmentManagerService.generateSlots({
        churchId,
        eventId,
        eventStartTime,
        eventEndTime,
        strategy: {
          kind: 'equal-split',
          slotDurationMinutes: 30,
        },
        existingSlots: [existingSlot],
      });
    }).toThrow(DuplicateSlotsError);
  });

  it('isolation: all generated slots have correct churchId and eventId', () => {
    const eventStartTime = new Date('2026-05-19T10:00:00Z');
    const eventEndTime = new Date('2026-05-19T11:00:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId: 'other-church',
      eventId: 'other-event',
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'equal-split',
        slotDurationMinutes: 30,
      },
    });

    const slot0 = result.slots[0];
    expect(slot0).toBeDefined();
    if (slot0) {
      expect(slot0.slot.churchId).toBe('other-church');
      expect(slot0.slot.eventId).toBe('other-event');
    }
  });
});

describe('Slot Generation — Template-Based', () => {
  const churchId = 'church-1';
  const eventId = 'event-1';
  const eventStartTime = new Date('2026-05-19T09:00:00Z');
  const eventEndTime = new Date('2026-05-19T13:00:00Z');

  it('3 periods → 3 slots with correct labels and time ranges', () => {
    const period1Start = new Date('2026-05-19T09:00:00Z');
    const period1End = new Date('2026-05-19T10:15:00Z');
    const period2Start = new Date('2026-05-19T10:15:00Z');
    const period2End = new Date('2026-05-19T11:30:00Z');
    const period3Start = new Date('2026-05-19T11:30:00Z');
    const period3End = new Date('2026-05-19T13:00:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId,
      eventId,
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'template-based',
        periods: [
          { label: 'Setup', startTime: period1Start, endTime: period1End },
          { label: 'Service', startTime: period2Start, endTime: period2End },
          { label: 'Teardown', startTime: period3Start, endTime: period3End },
        ],
      },
    });

    expect(result.totalCount).toBe(3);
    expect(result.hasRemainder).toBe(false);
    expect(result.slots).toHaveLength(3);

    const slot0 = result.slots[0];
    const slot1 = result.slots[1];
    const slot2 = result.slots[2];

    expect(slot0).toBeDefined();
    expect(slot1).toBeDefined();
    expect(slot2).toBeDefined();

    if (slot0) {
      expect(slot0.slot.label).toBe('Setup');
      expect(slot0.slot.startTime.getTime()).toBe(period1Start.getTime());
      expect(slot0.slot.endTime.getTime()).toBe(period1End.getTime());
    }
    if (slot1) {
      expect(slot1.slot.label).toBe('Service');
      expect(slot1.slot.startTime.getTime()).toBe(period2Start.getTime());
      expect(slot1.slot.endTime.getTime()).toBe(period2End.getTime());
    }
    if (slot2) {
      expect(slot2.slot.label).toBe('Teardown');
      expect(slot2.slot.startTime.getTime()).toBe(period3Start.getTime());
      expect(slot2.slot.endTime.getTime()).toBe(period3End.getTime());
    }
  });

  it('period with requirements → SlotRequirement entities created', () => {
    const periodStart = new Date('2026-05-19T09:00:00Z');
    const periodEnd = new Date('2026-05-19T11:00:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId,
      eventId,
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'template-based',
        periods: [
          {
            label: 'Shift A',
            startTime: periodStart,
            endTime: periodEnd,
            requirements: [
              { roleId: 'usher-role', requiredCount: 2, notes: 'Need usher' },
            ],
          },
        ],
      },
    });

    expect(result.totalCount).toBe(1);
    const slot0 = result.slots[0];
    expect(slot0).toBeDefined();
    if (slot0) {
      expect(slot0.requirements).toHaveLength(1);
      const req = slot0.requirements[0];
      expect(req).toBeDefined();
      if (req) {
        expect(req.churchId).toBe(churchId);
        expect(req.slotId).toBe(slot0.slot.id);
        expect(req.roleId).toBe('usher-role');
        expect(req.requiredCount).toBe(2);
        expect(req.notes).toBe('Need usher');
      }
    }
  });

  it('period with multiple requirements → multiple requirements per slot', () => {
    const periodStart = new Date('2026-05-19T09:00:00Z');
    const periodEnd = new Date('2026-05-19T11:00:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId,
      eventId,
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'template-based',
        periods: [
          {
            label: 'Shift A',
            startTime: periodStart,
            endTime: periodEnd,
            requirements: [
              { roleId: 'usher-role', requiredCount: 2 },
              { roleId: 'leader-role', requiredCount: 1, teamId: 'team-1' },
            ],
          },
        ],
      },
    });

    const slot0 = result.slots[0];
    expect(slot0).toBeDefined();
    if (slot0) {
      expect(slot0.requirements).toHaveLength(2);
      const req1 = slot0.requirements.find((r) => r.roleId === 'usher-role');
      const req2 = slot0.requirements.find((r) => r.roleId === 'leader-role');

      expect(req1).toBeDefined();
      expect(req2).toBeDefined();

      if (req1) {
        expect(req1.requiredCount).toBe(2);
        expect(req1.teamId).toBeUndefined();
      }
      if (req2) {
        expect(req2.requiredCount).toBe(1);
        expect(req2.teamId).toBe('team-1');
      }
    }
  });

  it('single period → 1 slot', () => {
    const periodStart = new Date('2026-05-19T09:00:00Z');
    const periodEnd = new Date('2026-05-19T13:00:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId,
      eventId,
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'template-based',
        periods: [
          { label: 'Solo Shift', startTime: periodStart, endTime: periodEnd },
        ],
      },
    });

    expect(result.totalCount).toBe(1);
    const slot0 = result.slots[0];
    expect(slot0).toBeDefined();
    if (slot0) {
      expect(slot0.slot.label).toBe('Solo Shift');
    }
  });

  it('period with zero requirements → slot with empty requirements', () => {
    const periodStart = new Date('2026-05-19T09:00:00Z');
    const periodEnd = new Date('2026-05-19T13:00:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId,
      eventId,
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'template-based',
        periods: [
          {
            label: 'Solo Shift',
            startTime: periodStart,
            endTime: periodEnd,
            requirements: [],
          },
        ],
      },
    });

    expect(result.totalCount).toBe(1);
    const slot0 = result.slots[0];
    expect(slot0).toBeDefined();
    if (slot0) {
      expect(slot0.requirements).toHaveLength(0);
    }
  });

  it('non-contiguous periods (gap) → slots match template exactly', () => {
    const period1Start = new Date('2026-05-19T09:00:00Z');
    const period1End = new Date('2026-05-19T10:00:00Z');
    const period2Start = new Date('2026-05-19T11:00:00Z');
    const period2End = new Date('2026-05-19T12:00:00Z');

    const result = AssignmentManagerService.generateSlots({
      churchId,
      eventId,
      eventStartTime,
      eventEndTime,
      strategy: {
        kind: 'template-based',
        periods: [
          { label: 'Morning', startTime: period1Start, endTime: period1End },
          { label: 'Noon', startTime: period2Start, endTime: period2End },
        ],
      },
    });

    expect(result.totalCount).toBe(2);
    const slot0 = result.slots[0];
    const slot1 = result.slots[1];

    expect(slot0).toBeDefined();
    expect(slot1).toBeDefined();

    if (slot0) {
      expect(slot0.slot.startTime.getTime()).toBe(period1Start.getTime());
      expect(slot0.slot.endTime.getTime()).toBe(period1End.getTime());
    }
    if (slot1) {
      expect(slot1.slot.startTime.getTime()).toBe(period2Start.getTime());
      expect(slot1.slot.endTime.getTime()).toBe(period2End.getTime());
    }
  });

  it('edge: event already has existing slots → DuplicateSlotsError', () => {
    const existingSlot = new TimeSlot({
      churchId,
      eventId,
      startTime: eventStartTime,
      endTime: eventEndTime,
    });

    expect(() => {
      AssignmentManagerService.generateSlots({
        churchId,
        eventId,
        eventStartTime,
        eventEndTime,
        strategy: {
          kind: 'template-based',
          periods: [
            { label: 'Slot', startTime: eventStartTime, endTime: eventEndTime },
          ],
        },
        existingSlots: [existingSlot],
      });
    }).toThrow(DuplicateSlotsError);
  });
});

describe('Publish Schedule', () => {
  const churchId = 'church-1';
  const leaderId = 'leader-1';
  const now = new Date('2026-05-19T09:00:00Z');

  it('draft event + 5 draft assignments, all pass → event published, assignments pending, transitionedCount = 5', () => {
    const event = new Event({
      churchId,
      ministryId: 'ministry-1',
      title: 'Sunday Service',
      startDate: new Date('2026-05-19T10:00:00Z'),
      endDate: new Date('2026-05-19T12:00:00Z'),
      status: 'draft',
    });

    const assignments = Array.from(
      { length: 5 },
      (_, i) =>
        new Assignment({
          churchId,
          slotId: `slot-${i}`,
          volunteerId: `vol-${i}`,
          roleId: `role-${i}`,
          status: 'draft',
        }),
    );

    const validationData = new Map();
    assignments.forEach((a) => {
      validationData.set(a.id, {
        volunteerId: a.volunteerId,
        ministryId: 'ministry-1',
        roleId: a.roleId,
        slotId: a.slotId,
        eventStartTime: event.startDate,
        volunteerQualifiedRoleIds: [a.roleId],
        volunteerMinistryIds: ['ministry-1'],
        existingSlotIds: [],
      });
    });

    const result = AssignmentManagerService.publish({
      churchId,
      event,
      assignments,
      now,
      actorId: leaderId,
      assignmentValidationData: validationData,
    });

    expect(result.event.status).toBe('published');
    expect(result.transitionedCount).toBe(5);
    expect(result.warnings).toEqual([]);
    expect(result.audits).toBeDefined();
    expect(result.audits).toHaveLength(5);

    result.audits?.forEach((audit) => {
      expect(audit.churchId).toBe(churchId);
      expect(audit.leaderId).toBe(leaderId);
      expect(audit.action).toBe('event_published');
      expect(audit.timestamp.getTime()).toBe(now.getTime());
    });

    assignments.forEach((a) => {
      expect(a.status).toBe('pending');
    });
  });

  it('draft event + 1 assignment → success (minimal case)', () => {
    const event = new Event({
      churchId,
      ministryId: 'ministry-1',
      title: 'Sunday Service',
      startDate: new Date('2026-05-19T10:00:00Z'),
      endDate: new Date('2026-05-19T12:00:00Z'),
      status: 'draft',
    });

    const assignment = new Assignment({
      churchId,
      slotId: 'slot-1',
      volunteerId: 'vol-1',
      roleId: 'role-1',
      status: 'draft',
    });

    const validationData = new Map();
    validationData.set(assignment.id, {
      volunteerId: assignment.volunteerId,
      ministryId: 'ministry-1',
      roleId: assignment.roleId,
      slotId: assignment.slotId,
      eventStartTime: event.startDate,
      volunteerQualifiedRoleIds: [assignment.roleId],
      volunteerMinistryIds: ['ministry-1'],
      existingSlotIds: [],
    });

    const result = AssignmentManagerService.publish({
      churchId,
      event,
      assignments: [assignment],
      now,
      actorId: leaderId,
      assignmentValidationData: validationData,
    });

    expect(result.event.status).toBe('published');
    expect(result.transitionedCount).toBe(1);
    expect(assignment.status).toBe('pending');
  });

  it('edge: zero assignments → EmptyScheduleError', () => {
    const event = new Event({
      churchId,
      ministryId: 'ministry-1',
      title: 'Sunday Service',
      startDate: new Date('2026-05-19T10:00:00Z'),
      endDate: new Date('2026-05-19T12:00:00Z'),
      status: 'draft',
    });

    expect(() => {
      AssignmentManagerService.publish({
        churchId,
        event,
        assignments: [],
        now,
        actorId: leaderId,
        assignmentValidationData: new Map(),
      });
    }).toThrow(EmptyScheduleError);
  });

  it('edge: event already published → InvalidStateTransitionError', () => {
    const event = new Event({
      churchId,
      ministryId: 'ministry-1',
      title: 'Sunday Service',
      startDate: new Date('2026-05-19T10:00:00Z'),
      endDate: new Date('2026-05-19T12:00:00Z'),
      status: 'published',
    });

    const assignment = new Assignment({
      churchId,
      slotId: 'slot-1',
      volunteerId: 'vol-1',
      roleId: 'role-1',
      status: 'draft',
    });

    expect(() => {
      AssignmentManagerService.publish({
        churchId,
        event,
        assignments: [assignment],
        now,
        actorId: leaderId,
        assignmentValidationData: new Map(),
      });
    }).toThrow(InvalidStateTransitionError);
  });

  it('edge: event already cancelled → InvalidStateTransitionError', () => {
    const event = new Event({
      churchId,
      ministryId: 'ministry-1',
      title: 'Sunday Service',
      startDate: new Date('2026-05-19T10:00:00Z'),
      endDate: new Date('2026-05-19T12:00:00Z'),
      status: 'cancelled',
    });

    const assignment = new Assignment({
      churchId,
      slotId: 'slot-1',
      volunteerId: 'vol-1',
      roleId: 'role-1',
      status: 'draft',
    });

    expect(() => {
      AssignmentManagerService.publish({
        churchId,
        event,
        assignments: [assignment],
        now,
        actorId: leaderId,
        assignmentValidationData: new Map(),
      });
    }).toThrow(InvalidStateTransitionError);
  });

  it('edge: event already past → InvalidStateTransitionError', () => {
    const event = new Event({
      churchId,
      ministryId: 'ministry-1',
      title: 'Sunday Service',
      startDate: new Date('2026-05-19T10:00:00Z'),
      endDate: new Date('2026-05-19T12:00:00Z'),
      status: 'past',
    });

    const assignment = new Assignment({
      churchId,
      slotId: 'slot-1',
      volunteerId: 'vol-1',
      roleId: 'role-1',
      status: 'draft',
    });

    expect(() => {
      AssignmentManagerService.publish({
        churchId,
        event,
        assignments: [assignment],
        now,
        actorId: leaderId,
        assignmentValidationData: new Map(),
      });
    }).toThrow(InvalidStateTransitionError);
  });

  it('edge: event start date in past → domain error', () => {
    const event = new Event({
      churchId,
      ministryId: 'ministry-1',
      title: 'Sunday Service',
      startDate: new Date('2026-05-19T08:00:00Z'),
      endDate: new Date('2026-05-19T12:00:00Z'),
      status: 'draft',
    });

    const assignment = new Assignment({
      churchId,
      slotId: 'slot-1',
      volunteerId: 'vol-1',
      roleId: 'role-1',
      status: 'draft',
    });

    expect(() => {
      AssignmentManagerService.publish({
        churchId,
        event,
        assignments: [assignment],
        now,
        actorId: leaderId,
        assignmentValidationData: new Map(),
      });
    }).toThrow(Error);
  });

  it('edge: 1 of 3 assignments fails hard constraint → PublishValidationError with 1 failure', () => {
    const event = new Event({
      churchId,
      ministryId: 'ministry-1',
      title: 'Sunday Service',
      startDate: new Date('2026-05-19T10:00:00Z'),
      endDate: new Date('2026-05-19T12:00:00Z'),
      status: 'draft',
    });

    const a1 = new Assignment({
      churchId,
      slotId: 's-1',
      volunteerId: 'v-1',
      roleId: 'r-1',
    });
    const a2 = new Assignment({
      churchId,
      slotId: 's-2',
      volunteerId: 'v-2',
      roleId: 'r-2',
    });
    const a3 = new Assignment({
      churchId,
      slotId: 's-3',
      volunteerId: 'v-3',
      roleId: 'r-3',
    });

    const validationData = new Map();
    validationData.set(a1.id, {
      volunteerId: 'v-1',
      ministryId: 'ministry-1',
      roleId: 'r-1',
      slotId: 's-1',
      eventStartTime: event.startDate,
      volunteerQualifiedRoleIds: ['r-1'],
      volunteerMinistryIds: ['ministry-1'],
      existingSlotIds: [],
    });
    validationData.set(a2.id, {
      volunteerId: 'v-2',
      ministryId: 'ministry-1',
      roleId: 'r-2',
      slotId: 's-2',
      eventStartTime: event.startDate,
      volunteerQualifiedRoleIds: ['r-other'],
      volunteerMinistryIds: ['ministry-1'],
      existingSlotIds: [],
    });
    validationData.set(a3.id, {
      volunteerId: 'v-3',
      ministryId: 'ministry-1',
      roleId: 'r-3',
      slotId: 's-3',
      eventStartTime: event.startDate,
      volunteerQualifiedRoleIds: ['r-3'],
      volunteerMinistryIds: ['ministry-1'],
      existingSlotIds: [],
    });

    let error: unknown;
    try {
      AssignmentManagerService.publish({
        churchId,
        event,
        assignments: [a1, a2, a3],
        now,
        actorId: leaderId,
        assignmentValidationData: validationData,
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(PublishValidationError);
    const validationError = error as PublishValidationError;
    expect(validationError.failures).toHaveLength(1);
    expect(validationError.failures[0]?.assignmentId).toBe(a2.id);
    expect(validationError.failures[0]?.volunteerId).toBe('v-2');
    expect(validationError.failures[0]?.reason).toBe('NOT_QUALIFIED');
  });

  it('edge: all assignments fail → PublishValidationError with all failures', () => {
    const event = new Event({
      churchId,
      ministryId: 'ministry-1',
      title: 'Sunday Service',
      startDate: new Date('2026-05-19T10:00:00Z'),
      endDate: new Date('2026-05-19T12:00:00Z'),
      status: 'draft',
    });

    const a1 = new Assignment({
      churchId,
      slotId: 's-1',
      volunteerId: 'v-1',
      roleId: 'r-1',
    });
    const a2 = new Assignment({
      churchId,
      slotId: 's-2',
      volunteerId: 'v-2',
      roleId: 'r-2',
    });

    const validationData = new Map();
    validationData.set(a1.id, {
      volunteerId: 'v-1',
      ministryId: 'ministry-1',
      roleId: 'r-1',
      slotId: 's-1',
      eventStartTime: event.startDate,
      volunteerQualifiedRoleIds: ['r-other'],
      volunteerMinistryIds: ['ministry-1'],
      existingSlotIds: [],
    });
    validationData.set(a2.id, {
      volunteerId: 'v-2',
      ministryId: 'ministry-1',
      roleId: 'r-2',
      slotId: 's-2',
      eventStartTime: event.startDate,
      volunteerQualifiedRoleIds: ['r-2'],
      volunteerMinistryIds: ['ministry-other'],
      existingSlotIds: [],
    });

    let error: unknown;
    try {
      AssignmentManagerService.publish({
        churchId,
        event,
        assignments: [a1, a2],
        now,
        actorId: leaderId,
        assignmentValidationData: validationData,
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(PublishValidationError);
    expect((error as PublishValidationError).failures).toHaveLength(2);
  });

  it('edge: hard constraint failure does NOT mutate any status (rollback)', () => {
    const event = new Event({
      churchId,
      ministryId: 'ministry-1',
      title: 'Sunday Service',
      startDate: new Date('2026-05-19T10:00:00Z'),
      endDate: new Date('2026-05-19T12:00:00Z'),
      status: 'draft',
    });

    const a1 = new Assignment({
      churchId,
      slotId: 's-1',
      volunteerId: 'v-1',
      roleId: 'r-1',
      status: 'draft',
    });
    const a2 = new Assignment({
      churchId,
      slotId: 's-2',
      volunteerId: 'v-2',
      roleId: 'r-2',
      status: 'draft',
    });

    const validationData = new Map();
    validationData.set(a1.id, {
      volunteerId: 'v-1',
      ministryId: 'ministry-1',
      roleId: 'r-1',
      slotId: 's-1',
      eventStartTime: event.startDate,
      volunteerQualifiedRoleIds: ['r-1'],
      volunteerMinistryIds: ['ministry-1'],
      existingSlotIds: [],
    });
    validationData.set(a2.id, {
      volunteerId: 'v-2',
      ministryId: 'ministry-1',
      roleId: 'r-2',
      slotId: 's-2',
      eventStartTime: event.startDate,
      volunteerQualifiedRoleIds: ['r-other'],
      volunteerMinistryIds: ['ministry-1'],
      existingSlotIds: [],
    });

    expect(() => {
      AssignmentManagerService.publish({
        churchId,
        event,
        assignments: [a1, a2],
        now,
        actorId: leaderId,
        assignmentValidationData: validationData,
      });
    }).toThrow(PublishValidationError);

    expect(event.status).toBe('draft');
    expect(a1.status).toBe('draft');
    expect(a2.status).toBe('draft');
  });
});
