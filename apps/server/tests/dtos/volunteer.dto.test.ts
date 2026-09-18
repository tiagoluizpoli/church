import { isInstant, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import { volunteerMapper } from '../../src/api/dtos/volunteer.dto';
import { Assignment } from '../../src/domain/entities/assignment';

describe('volunteerMapper', () => {
  describe('dashboardToResponse', () => {
    it('passes through a dashboard with defaultMinistryId present', () => {
      const dashboard = {
        availabilityTasks: [],
        upcomingAssignmentGroups: [],
        unreadNotificationCount: 2,
        notificationPreview: [],
        defaultMinistryId: 'm1',
        ministryOptions: [],
      };

      const response = volunteerMapper.dashboardToResponse(dashboard);

      expect(response).toEqual(dashboard);
    });

    it('passes through a dashboard with defaultMinistryId absent', () => {
      const dashboard = {
        availabilityTasks: [],
        upcomingAssignmentGroups: [],
        unreadNotificationCount: 0,
        notificationPreview: [],
        ministryOptions: [],
      };

      const response = volunteerMapper.dashboardToResponse(dashboard);

      expect(response.defaultMinistryId).toBeUndefined();
    });

    it('parses a non-empty dashboard, branding every date/time field', () => {
      const dashboard = {
        availabilityTasks: [
          {
            eventId: 'event-1',
            eventTitle: 'Sunday Service',
            ministryId: 'ministry-1',
            ministryName: 'Worship',
            eventType: 'hourly' as const,
            eventStart: '2026-05-15T09:00:00.000Z',
            eventEnd: '2026-05-15T11:00:00.000Z',
            completionState: 'missing' as const,
          },
        ],
        upcomingAssignmentGroups: [
          {
            eventId: 'event-1',
            eventTitle: 'Sunday Service',
            ministryId: 'ministry-1',
            ministryName: 'Worship',
            eventStart: '2026-05-15T09:00:00.000Z',
            aggregateResponseState: 'pending' as const,
            hasPendingResponse: true,
            assignments: [
              {
                assignmentId: 'assignment-1',
                slotId: 'slot-1',
                shiftId: 'shift-1',
                participationId: 'participation-1',
                roleId: 'role-1',
                roleName: 'Vocalist',
                startTime: '2026-05-15T09:00:00.000Z',
                endTime: '2026-05-15T10:00:00.000Z',
                status: 'pending' as const,
                timingState: 'upcoming' as const,
                canRespond: true,
              },
            ],
          },
        ],
        unreadNotificationCount: 1,
        notificationPreview: [
          {
            id: 'notification-1',
            type: 'assignment_added',
            title: 'New assignment',
            body: 'You were assigned a shift',
            readAt: '2026-05-14T00:00:00.000Z',
            createdAt: '2026-05-13T00:00:00.000Z',
          },
        ],
        ministryOptions: [],
      };

      const response = volunteerMapper.dashboardToResponse(dashboard);

      const task = response.availabilityTasks[0];
      const group = response.upcomingAssignmentGroups[0];
      const assignment = group?.assignments[0];
      const notification = response.notificationPreview[0];
      if (!task || !group || !assignment || !notification) {
        throw new Error('expected every mapped section to be populated');
      }
      expect(isInstant({ value: task.eventStart })).toBe(true);
      expect(isInstant({ value: task.eventEnd })).toBe(true);
      expect(isInstant({ value: group.eventStart })).toBe(true);
      expect(isInstant({ value: assignment.startTime })).toBe(true);
      expect(isInstant({ value: assignment.endTime })).toBe(true);
      expect(isInstant({ value: notification.readAt ?? '' })).toBe(true);
      expect(isInstant({ value: notification.createdAt })).toBe(true);
    });

    it('throws on a malformed date/time field instead of silently passing it through', () => {
      const dashboard = {
        availabilityTasks: [
          {
            eventId: 'event-1',
            eventTitle: 'Sunday Service',
            ministryId: 'ministry-1',
            ministryName: 'Worship',
            eventType: 'hourly' as const,
            eventStart: 'not-a-real-instant',
            eventEnd: '2026-05-15T11:00:00.000Z',
            completionState: 'missing' as const,
          },
        ],
        upcomingAssignmentGroups: [],
        unreadNotificationCount: 0,
        notificationPreview: [],
        ministryOptions: [],
      };

      expect(() => volunteerMapper.dashboardToResponse(dashboard)).toThrow();
    });
  });

  describe('assignmentsToResponse', () => {
    it('maps assignments with optional fields present', () => {
      const assignedAt = parseInstant({ value: '2026-01-01T00:00:00.000Z' });
      const assignment = new Assignment(
        {
          churchId: 'c1',
          slotId: 's1',
          participationId: 'p1',
          shiftId: 'sh1',
          volunteerId: 'v1',
          roleId: 'r1',
          status: 'confirmed',
          reason: 'because',
          assignedAt,
          assignedBy: 'u1',
        },
        'a1',
      );

      const response = volunteerMapper.assignmentsToResponse([assignment]);

      expect(response.assignments).toEqual([
        {
          id: 'a1',
          churchId: 'c1',
          slotId: 's1',
          participationId: 'p1',
          shiftId: 'sh1',
          volunteerId: 'v1',
          roleId: 'r1',
          status: 'confirmed',
          reason: 'because',
          assignedAt: assignedAt,
          assignedBy: 'u1',
        },
      ]);
    });

    it('maps assignments with optional fields absent', () => {
      const assignment = new Assignment(
        {
          churchId: 'c1',
          slotId: 's1',
          volunteerId: 'v1',
          roleId: 'r1',
        },
        'a1',
      );

      const response = volunteerMapper.assignmentsToResponse([assignment]);

      const mapped = response.assignments[0];
      expect(mapped?.participationId).toBeUndefined();
      expect(mapped?.shiftId).toBeUndefined();
      expect(mapped?.reason).toBeUndefined();
      expect(mapped?.assignedBy).toBeUndefined();
    });

    it('maps an empty list of assignments', () => {
      const response = volunteerMapper.assignmentsToResponse([]);

      expect(response.assignments).toEqual([]);
    });
  });

  describe('assignmentToResponse', () => {
    it('maps a single assignment', () => {
      const assignment = new Assignment(
        {
          churchId: 'c1',
          slotId: 's1',
          volunteerId: 'v1',
          roleId: 'r1',
        },
        'a1',
      );

      const response = volunteerMapper.assignmentToResponse(assignment);

      expect(response.id).toBe('a1');
      expect(response.status).toBe('draft');
    });
  });

  describe('ministryScheduleToResponse', () => {
    it('passes through a ministry schedule', () => {
      const schedule = {
        ministryId: 'm1',
        ministryName: 'Worship',
        events: [],
      };

      const response = volunteerMapper.ministryScheduleToResponse(schedule);

      expect(response).toEqual(schedule);
    });

    it('parses a non-empty schedule, branding each event and preserving its rows', () => {
      const schedule = {
        ministryId: 'm1',
        ministryName: 'Worship',
        events: [
          {
            eventId: 'event-1',
            title: 'Sunday Service',
            startDate: '2026-05-15T09:00:00.000Z',
            endDate: '2026-05-15T11:00:00.000Z',
            assignmentCount: 1,
            rows: [
              {
                slotId: 'slot-1',
                slotLabel: 'Worship Set',
                roleName: 'Vocalist',
                confirmationState: 'confirmed' as const,
              },
            ],
          },
        ],
      };

      const response = volunteerMapper.ministryScheduleToResponse(schedule);

      const event = response.events[0];
      if (!event) throw new Error('expected a mapped event');
      expect(isInstant({ value: event.startDate })).toBe(true);
      expect(isInstant({ value: event.endDate })).toBe(true);
      expect(event.rows).toEqual(schedule.events[0]?.rows);
    });
  });

  describe('availabilityCheckListToResponse', () => {
    it('maps summaries with confirmedAt present', () => {
      const confirmedAt = parseInstant({ value: '2026-01-10T00:00:00.000Z' });

      const response = volunteerMapper.availabilityCheckListToResponse([
        {
          id: 'chk1',
          planningCycleId: 'pc1',
          planningCycleName: 'Spring 2026',
          ministryId: 'm1',
          ministryName: 'Worship',
          state: 'confirmed',
          confirmedAt,
          totalShiftCount: 5,
          unavailableShiftCount: 1,
        },
      ]);

      expect(response.checks[0]?.confirmedAt).toBe(confirmedAt);
      expect(response.checks[0]?.state).toBe('confirmed');
    });

    it('maps summaries with confirmedAt absent', () => {
      const response = volunteerMapper.availabilityCheckListToResponse([
        {
          id: 'chk2',
          planningCycleId: 'pc1',
          planningCycleName: 'Spring 2026',
          ministryId: 'm1',
          ministryName: 'Worship',
          state: 'pending',
          totalShiftCount: 3,
          unavailableShiftCount: 0,
        },
      ]);

      expect(response.checks[0]?.confirmedAt).toBeUndefined();
    });

    it('maps an empty list of summaries', () => {
      const response = volunteerMapper.availabilityCheckListToResponse([]);

      expect(response.checks).toEqual([]);
    });
  });

  describe('availabilityCheckDetailToResponse', () => {
    it('maps a detail with confirmedAt present and shifts non-empty (label present and absent)', () => {
      const confirmedAt = parseInstant({ value: '2026-01-10T00:00:00.000Z' });
      const startTime = parseInstant({ value: '2026-01-11T09:00:00.000Z' });
      const endTime = parseInstant({ value: '2026-01-11T11:00:00.000Z' });

      const response = volunteerMapper.availabilityCheckDetailToResponse({
        id: 'chk1',
        planningCycleId: 'pc1',
        planningCycleName: 'Spring 2026',
        ministryId: 'm1',
        ministryName: 'Worship',
        state: 'confirmed',
        confirmedAt,
        shifts: [
          {
            shiftId: 'sh1',
            eventId: 'e1',
            eventTitle: 'Sunday Service',
            startTime,
            endTime,
            label: 'Morning',
            available: true,
          },
          {
            shiftId: 'sh2',
            eventId: 'e2',
            eventTitle: 'Evening Service',
            startTime,
            endTime,
            available: false,
          },
        ],
      });

      expect(response.confirmedAt).toBe(confirmedAt);
      expect(response.shifts).toHaveLength(2);
      expect(response.shifts[0]?.label).toBe('Morning');
      expect(response.shifts[1]?.label).toBeUndefined();
      expect(response.shifts[0]?.startTime).toBe(startTime);
    });

    it('maps a detail with confirmedAt absent and shifts empty', () => {
      const response = volunteerMapper.availabilityCheckDetailToResponse({
        id: 'chk2',
        planningCycleId: 'pc1',
        planningCycleName: 'Spring 2026',
        ministryId: 'm1',
        ministryName: 'Worship',
        state: 'pending',
        shifts: [],
      });

      expect(response.confirmedAt).toBeUndefined();
      expect(response.shifts).toEqual([]);
    });
  });
});
