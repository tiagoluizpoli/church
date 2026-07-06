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
  });

  describe('assignmentsToResponse', () => {
    it('maps assignments with optional fields present', () => {
      const assignedAt = new Date('2026-01-01T00:00:00.000Z');
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
          assignedAt: assignedAt.toISOString(),
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
  });

  describe('availabilityCheckListToResponse', () => {
    it('maps summaries with confirmedAt present', () => {
      const confirmedAt = new Date('2026-01-10T00:00:00.000Z');

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

      expect(response.checks[0]?.confirmedAt).toBe(confirmedAt.toISOString());
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
      const confirmedAt = new Date('2026-01-10T00:00:00.000Z');
      const startTime = new Date('2026-01-11T09:00:00.000Z');
      const endTime = new Date('2026-01-11T11:00:00.000Z');

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

      expect(response.confirmedAt).toBe(confirmedAt.toISOString());
      expect(response.shifts).toHaveLength(2);
      expect(response.shifts[0]?.label).toBe('Morning');
      expect(response.shifts[1]?.label).toBeUndefined();
      expect(response.shifts[0]?.startTime).toBe(startTime.toISOString());
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
