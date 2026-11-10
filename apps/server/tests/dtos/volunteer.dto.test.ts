import { randomUUID } from 'node:crypto';
import { isInstant, parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import { volunteerMapper } from '@/api/dtos/volunteer.dto';
import { Assignment } from '@/domain/entities/assignment';
import { Notification } from '@/domain/entities/notification';

describe('volunteerMapper', () => {
  describe('dashboardToResponse', () => {
    it('passes through a dashboard with defaultMinistryId present', () => {
      const dashboard = {
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
                eventTimeBlockId: 'event-time-block-1',
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
          new Notification({
            props: {
              userId: 'user-1',
              churchId: 'church-1',
              sourceOutboxId: randomUUID(),
              kind: 'ministry_invitation',
              data: {
                ministryInvitationId: randomUUID(),
                ministryId: randomUUID(),
                ministryName: 'Worship',
              },
              readAt: parseInstant({ value: '2026-05-14T00:00:00.000Z' }),
            },
            id: randomUUID(),
            createdAt: new Date('2026-05-13T00:00:00.000Z'),
          }),
        ],
        ministryOptions: [],
      };

      const response = volunteerMapper.dashboardToResponse(dashboard);

      const group = response.upcomingAssignmentGroups[0];
      const assignment = group?.assignments[0];
      const notification = response.notificationPreview[0];
      if (!group || !assignment || !notification) {
        throw new Error('expected every mapped section to be populated');
      }
      expect(isInstant({ value: group.eventStart })).toBe(true);
      expect(isInstant({ value: assignment.startTime })).toBe(true);
      expect(isInstant({ value: assignment.endTime })).toBe(true);
      expect(isInstant({ value: notification.readAt ?? '' })).toBe(true);
      expect(isInstant({ value: notification.createdAt })).toBe(true);
    });
  });

  describe('assignmentToResponse', () => {
    it('maps a single assignment', () => {
      const assignment = new Assignment({
        props: {
          churchId: 'c1',
          eventTimeBlockId: 's1',
          volunteerId: 'v1',
          roleId: 'r1',
          shiftRequirementId: '00000000-0000-0000-0000-000000000021' as never,
        },
        id: 'a1',
      });

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
        cycleId: 'c1',
        cycleName: 'October',
        published: true,
        events: [],
      };

      const response = volunteerMapper.ministryScheduleToResponse(schedule);

      expect(response).toEqual(schedule);
    });

    it('parses a non-empty schedule, branding each event and preserving its rows', () => {
      const schedule = {
        ministryId: 'm1',
        ministryName: 'Worship',
        cycleId: 'c1',
        cycleName: 'October',
        published: true,
        events: [
          {
            eventId: 'event-1',
            title: 'Sunday Service',
            start: '2026-05-15T09:00:00.000Z',
            end: '2026-05-15T11:00:00.000Z',
            assignmentCount: 1,
            rows: [
              {
                shiftId: 'shift-1',
                shiftLabel: 'Worship Set',
                shiftStart: '2026-05-15T09:00:00.000Z',
                shiftEnd: '2026-05-15T10:00:00.000Z',
                sectorName: 'Sanctuary',
                roleName: 'Vocalist',
              },
            ],
          },
        ],
      };

      const response = volunteerMapper.ministryScheduleToResponse(schedule);

      const event = response.events[0];
      if (!event) throw new Error('expected a mapped event');
      expect(isInstant({ value: event.start })).toBe(true);
      expect(isInstant({ value: event.end })).toBe(true);
      expect(event.rows).toEqual(schedule.events[0]?.rows);
    });
  });

  describe('availabilityCheckListToResponse', () => {
    it('maps summaries with confirmedAt present', () => {
      const confirmedAt = parseInstant({ value: '2026-01-10T00:00:00.000Z' });

      const response = volunteerMapper.availabilityCheckListToResponse([
        {
          answerBy: null,
          id: 'chk1',
          cycleId: 'pc1',
          cycleName: 'Spring 2026',
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
          answerBy: null,
          id: 'chk2',
          cycleId: 'pc1',
          cycleName: 'Spring 2026',
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
        answerBy: null,
        readOnly: false,
        id: 'chk1',
        cycleId: 'pc1',
        cycleName: 'Spring 2026',
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
            published: false,
          },
          {
            shiftId: 'sh2',
            eventId: 'e2',
            eventTitle: 'Evening Service',
            startTime,
            endTime,
            available: false,
            published: false,
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
        answerBy: null,
        readOnly: false,
        id: 'chk2',
        cycleId: 'pc1',
        cycleName: 'Spring 2026',
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
