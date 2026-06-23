// biome-ignore-all lint/suspicious/noExplicitAny: needed for test mocks
import { describe, expect, it } from 'vitest';
import { AssignmentManagerService } from '../../../src/domain/assignment/assignment-manager-service';
import type { AssignmentId } from '../../../src/domain/entities/assignment';
import { Assignment } from '../../../src/domain/entities/assignment';
import type { ChurchId } from '../../../src/domain/entities/church';
import type { EventId } from '../../../src/domain/entities/event';
import { Event } from '../../../src/domain/entities/event';
import type { MinistryId } from '../../../src/domain/entities/ministry';
import type { RoleId } from '../../../src/domain/entities/role';
import type { TimeSlotId } from '../../../src/domain/entities/time-slot';
import { TimeSlot } from '../../../src/domain/entities/time-slot';
import { Volunteer } from '../../../src/domain/entities/volunteer';
import type { AssignmentRepository } from '../../../src/domain/repositories/assignment.repository';
import type { AssignmentAuditRepository } from '../../../src/domain/repositories/assignment-audit.repository';
import type { EventRepository } from '../../../src/domain/repositories/event.repository';
import type { TimeSlotRepository } from '../../../src/domain/repositories/time-slot.repository';
import type { VolunteerRepository } from '../../../src/domain/repositories/volunteer.repository';

describe('Coverage L3: Assignment Manager Service Data Access', () => {
  it('should verify all required L3 data operations are covered by repository interfaces', async () => {
    // 1. Mock repositories using the defined interfaces
    const mockEventRepo: Partial<EventRepository> = {
      getById: async (churchId, id) => {
        return new Event(
          {
            churchId,
            ministryId: 'ministry-1' as MinistryId,
            title: 'Youth Gathering',
            startDate: new Date('2024-06-15T10:00:00Z'),
            endDate: new Date('2024-06-15T12:00:00Z'),
            status: 'draft',
          },
          id,
        );
      },
    };

    const mockTimeSlotRepo: Partial<TimeSlotRepository> = {
      listByEvent: async (churchId, eventId) => {
        return [
          new TimeSlot(
            {
              churchId,
              eventId,
              startTime: new Date('2024-06-15T10:00:00Z'),
              endTime: new Date('2024-06-15T12:00:00Z'),
              status: 'active',
            },
            'slot-1' as TimeSlotId,
          ),
        ];
      },
    };

    const mockAssignmentRepo: Partial<AssignmentRepository> = {
      listByEvent: async (churchId, _eventId) => {
        return [
          new Assignment(
            {
              churchId,
              slotId: 'slot-1' as TimeSlotId,
              volunteerId: 'volunteer-1' as any,
              roleId: 'role-1' as RoleId,
              status: 'draft',
            },
            'assignment-1' as AssignmentId,
          ),
        ];
      },
      listDeclinedBySlot: async (_churchId, _slotId) => {
        return [];
      },
      countByVolunteerInRange: async (
        _churchId,
        _volunteerId,
        _startTime,
        _endTime,
      ) => {
        return 1;
      },
      updateStatus: async (_churchId, _id, _input) => {},
    };

    const mockVolunteerRepo: Partial<VolunteerRepository> = {
      listQualifiedForRole: async (churchId, _ministryId, _roleId) => {
        return [
          new Volunteer(
            {
              churchId,
              userId: 'user-1' as any,
              status: 'active',
            },
            'volunteer-1' as any,
          ),
        ];
      },
    };

    const mockAuditRepo: Partial<AssignmentAuditRepository> = {
      create: async (churchId, input) => {
        return {
          id: 'audit-1' as any,
          churchId,
          ...input,
          timestamp: new Date(),
        } as any;
      },
    };

    // 2. Perform L3 orchestration simulation: Publishing an Event
    const churchId = 'church-1' as ChurchId;
    const eventId = 'event-1' as EventId;

    // Fetch event details
    const event = await mockEventRepo.getById!(churchId, eventId);
    const slots = await mockTimeSlotRepo.listByEvent!(churchId, eventId);
    const assignments = await mockAssignmentRepo.listByEvent!(
      churchId,
      eventId,
    );

    // Prepare validation data map
    const validationMap = new Map<AssignmentId, any>();
    for (const a of assignments) {
      validationMap.set(a.id, {
        volunteerId: a.volunteerId,
        ministryId: event.ministryId,
        roleId: a.roleId,
        slotId: a.slotId,
        eventStartTime: event.startDate,
        existingSlotIds: [],
        volunteerQualifiedRoleIds: [a.roleId],
        volunteerMinistryIds: [event.ministryId],
      });
    }

    // Call L3 publish logic
    const publishResult = AssignmentManagerService.publish({
      churchId,
      event,
      assignments,
      now: new Date('2024-06-10T10:00:00Z'),
      actorId: 'user-admin' as any,
      assignmentValidationData: validationMap,
    });

    expect(publishResult.event.status).toBe('published');
    expect(publishResult.audits).toBeDefined();
    expect(publishResult.audits?.length).toBe(1);

    // Persist changes using repos
    for (const audit of publishResult.audits!) {
      await mockAuditRepo.create!(churchId, {
        assignmentId: audit.assignmentId,
        actorId: audit.actorId,
        action: audit.action,
        reason: audit.reason || 'Publish',
        overrideConflictTypes: audit.overrideConflictTypes,
      });
    }

    // 3. Perform L3 orchestration simulation: Finding Replacements
    const targetSlot = slots[0];
    expect(targetSlot).toBeDefined();

    const qualifiedVolunteers = await mockVolunteerRepo.listQualifiedForRole!(
      churchId,
      event.ministryId,
      'role-1' as RoleId,
    );
    const declinedAssignments = await mockAssignmentRepo.listDeclinedBySlot!(
      churchId,
      targetSlot!.id,
    );

    const workloadMap = new Map<string, number>();
    for (const v of qualifiedVolunteers) {
      const count = await mockAssignmentRepo.countByVolunteerInRange!(
        churchId,
        v.id,
        new Date('2024-06-01T00:00:00Z'),
        new Date('2024-06-30T23:59:59Z'),
      );
      workloadMap.set(v.id, count);
    }

    const replacements = AssignmentManagerService.findReplacements({
      churchId,
      slotId: targetSlot!.id,
      roleId: 'role-1' as RoleId,
      qualifiedVolunteerIds: qualifiedVolunteers.map((v) => v.id),
      declinedVolunteerIds: declinedAssignments.map((a) => a.volunteerId),
      slotTimeRange: { start: targetSlot!.startTime, end: targetSlot!.endTime },
      existingBlockouts: [],
      existingAssignments: [],
      workloadMap,
    });

    expect(replacements.length).toBe(1);
    expect(replacements[0]).toBeDefined();
    expect(replacements[0]?.volunteerId).toBe('volunteer-1');
  });
});
