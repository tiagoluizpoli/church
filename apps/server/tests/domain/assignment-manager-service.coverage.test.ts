import { describe, expect, it, vi } from 'vitest';
import { AssignmentManagerService } from '../../src/domain/assignment/assignment-manager-service';
import { PublishValidationError } from '../../src/domain/assignment/errors';
import { ConflictValidationService } from '../../src/domain/conflict/conflict-validation-service';
import { Assignment } from '../../src/domain/entities/assignment';
import { Event, type EventStatus } from '../../src/domain/entities/event';
import { IsolationBreachError } from '../../src/domain/errors';

const CHURCH_ID = 'church-1';
const NOW = new Date('2026-07-01T10:00:00Z');

function makeEvent(churchId = CHURCH_ID, status: EventStatus = 'draft') {
  return new Event({
    churchId,
    ministryId: 'ministry-1',
    title: 'Service',
    startDate: new Date('2026-07-01T11:00:00Z'),
    endDate: new Date('2026-07-01T12:00:00Z'),
    status,
  });
}

function makeAssignment(churchId = CHURCH_ID) {
  return new Assignment({
    churchId,
    slotId: 'slot-1',
    volunteerId: 'volunteer-1',
    roleId: 'role-1',
  });
}

function makeValidationData(assignment: Assignment, event: Event) {
  return new Map([
    [
      assignment.id,
      {
        volunteerId: assignment.volunteerId,
        ministryId: event.ministryId,
        roleId: assignment.roleId,
        slotId: assignment.slotId,
        eventStartTime: event.startDate,
        volunteerQualifiedRoleIds: [assignment.roleId],
        volunteerMinistryIds: [event.ministryId],
        existingSlotIds: [],
      },
    ],
  ]);
}

describe('AssignmentManagerService uncovered branches', () => {
  it('rejects cross-church event and assignment publication', () => {
    expect(() =>
      AssignmentManagerService.publish({
        churchId: CHURCH_ID,
        event: makeEvent('other-church'),
        assignments: [makeAssignment()],
        now: NOW,
        actorId: 'actor-1',
        assignmentValidationData: new Map(),
      }),
    ).toThrow(IsolationBreachError);

    expect(() =>
      AssignmentManagerService.publish({
        churchId: CHURCH_ID,
        event: makeEvent(),
        assignments: [makeAssignment('other-church')],
        now: NOW,
        actorId: 'actor-1',
        assignmentValidationData: new Map(),
      }),
    ).toThrow(IsolationBreachError);
  });

  it('reports missing and non-Error hard-constraint failures', () => {
    const assignment = makeAssignment();
    expect(() =>
      AssignmentManagerService.publish({
        churchId: CHURCH_ID,
        event: makeEvent(),
        assignments: [assignment],
        now: NOW,
        actorId: 'actor-1',
        assignmentValidationData: new Map(),
      }),
    ).toThrow(PublishValidationError);

    const event = makeEvent();
    const validationData = makeValidationData(assignment, event);
    const validate = vi
      .spyOn(ConflictValidationService, 'validateHardConstraints')
      .mockImplementationOnce(() => {
        throw 'validation failed';
      });

    expect(() =>
      AssignmentManagerService.publish({
        churchId: CHURCH_ID,
        event,
        assignments: [assignment],
        now: NOW,
        actorId: 'actor-1',
        assignmentValidationData: validationData,
      }),
    ).toThrow(PublishValidationError);
    validate.mockRestore();
  });

  it('rejects cancellation for a cross-church event', () => {
    expect(() =>
      AssignmentManagerService.cancelEvent({
        churchId: CHURCH_ID,
        event: makeEvent('other-church'),
        slots: [],
        assignments: [],
        actorId: 'actor-1',
        now: NOW,
      }),
    ).toThrow(IsolationBreachError);
  });

  it('ignores unowned contexts and defaults missing workload to zero', () => {
    const timeRange = {
      start: new Date('2026-07-01T11:00:00Z'),
      end: new Date('2026-07-01T12:00:00Z'),
    };
    const result = AssignmentManagerService.findReplacements({
      churchId: CHURCH_ID,
      slotId: 'slot-1',
      roleId: 'role-1',
      slotTimeRange: timeRange,
      qualifiedVolunteerIds: ['volunteer-1'],
      declinedVolunteerIds: [],
      existingBlockouts: [
        {
          id: 'blockout-1',
          churchId: CHURCH_ID,
          timeRange,
          isAllDay: false,
        },
      ],
      existingAssignments: [
        {
          id: 'assignment-1',
          churchId: CHURCH_ID,
          timeRange,
          status: 'confirmed',
        },
      ],
      workloadMap: new Map(),
    });

    expect(result).toEqual([{ volunteerId: 'volunteer-1', workloadCount: 0 }]);
  });

  it('leaves an expired event with an unknown status unchanged', () => {
    const event = makeEvent(CHURCH_ID, 'unknown' as EventStatus);

    expect(
      AssignmentManagerService.transitionExpiredEvent({
        churchId: CHURCH_ID,
        event,
        assignments: [],
        now: new Date('2026-07-01T13:00:00Z'),
      }),
    ).toEqual({ transitioned: false, assignmentsAutoConfirmed: 0 });
  });
});
