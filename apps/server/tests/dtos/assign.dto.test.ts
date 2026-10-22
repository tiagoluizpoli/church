import { parseInstant } from '@church/time';
import { describe, expect, it } from 'vitest';
import {
  assignMapper,
  createParticipationAssignmentResponseSchema,
} from '@/api/dtos/assign.dto';
import { MinistryParticipationId, VolunteerId } from '@/domain/branded-ids';
import { Assignment } from '@/domain/entities/assignment';

describe('assignMapper', () => {
  describe('eligibleVolunteerToResponse', () => {
    it('maps a volunteer with lastServedAt present', () => {
      const lastServedAt = parseInstant({ value: '2026-01-01T00:00:00.000Z' });

      const response = assignMapper.eligibleVolunteerToResponse({
        volunteerId: VolunteerId.from('v1'),
        volunteerName: 'Jane',
        isAvailable: true,
        hasConflict: false,
        lastServedAt,
        qualifiedRoleIds: ['role-1', 'role-2'],
        ministryAccessLevel: 'leader',
      });

      expect(response).toEqual({
        volunteerId: 'v1',
        volunteerName: 'Jane',
        isAvailable: true,
        hasConflict: false,
        lastServedAt,
        qualifiedRoleIds: ['role-1', 'role-2'],
        ministryAccessLevel: 'leader',
      });
    });

    it('maps a volunteer with lastServedAt absent', () => {
      const response = assignMapper.eligibleVolunteerToResponse({
        volunteerId: VolunteerId.from('v2'),
        volunteerName: 'John',
        isAvailable: false,
        hasConflict: true,
        qualifiedRoleIds: [],
        ministryAccessLevel: 'volunteer',
      });

      expect(response.lastServedAt).toBeUndefined();
      expect(response.qualifiedRoleIds).toEqual([]);
      expect(response.ministryAccessLevel).toBe('volunteer');
      expect(response).not.toHaveProperty('leadTeamIds');
    });
  });

  describe('eligibleVolunteerListToResponse', () => {
    it('maps a list of volunteers', () => {
      const response = assignMapper.eligibleVolunteerListToResponse([
        {
          volunteerId: VolunteerId.from('v1'),
          volunteerName: 'Jane',
          isAvailable: true,
          hasConflict: false,
          qualifiedRoleIds: ['role-1'],
          ministryAccessLevel: 'leader',
        },
        {
          volunteerId: VolunteerId.from('v2'),
          volunteerName: 'John',
          isAvailable: false,
          hasConflict: true,
          qualifiedRoleIds: [],
          lastServedAt: parseInstant({ value: '2026-01-05T00:00:00.000Z' }),
          ministryAccessLevel: 'volunteer',
        },
      ]);

      expect(response.volunteers).toHaveLength(2);
      expect(response.volunteers[0]?.volunteerId).toBe('v1');
      expect(response.volunteers[0]?.ministryAccessLevel).toBe('leader');
      expect(response.volunteers[1]?.lastServedAt).toBeDefined();
    });

    it('maps an empty list', () => {
      const response = assignMapper.eligibleVolunteerListToResponse([]);

      expect(response.volunteers).toEqual([]);
    });
  });

  describe('assignmentResultToResponse', () => {
    const buildAssignment = () =>
      new Assignment({
        props: {
          churchId: 'c1',
          eventTimeBlockId: 's1',
          volunteerId: 'v1',
          roleId: 'r1',
          shiftRequirementId: '00000000-0000-0000-0000-000000000021' as never,
        },
        id: 'a1',
      });

    it('maps a result with empty warnings', () => {
      const assignment = buildAssignment();

      const response = assignMapper.assignmentResultToResponse({
        assignment,
        warnings: [],
      });

      expect(response.assignment.id).toBe('a1');
      expect(response.warnings).toEqual([]);
    });

    it('maps a result with warnings including conflictingId present and absent', () => {
      const assignment = buildAssignment();

      const response = assignMapper.assignmentResultToResponse({
        assignment,
        warnings: [
          {
            type: 'UNAVAILABLE',
            details: 'volunteer is unavailable',
          },
          {
            type: 'DOUBLE_BOOKED',
            details: 'volunteer already booked',
            conflictingId: 'a2',
          },
          {
            type: 'FAIRNESS_EXCEEDED',
            details: 'volunteer over fairness limit',
          },
          {
            type: 'NOT_QUALIFIED',
            details: 'volunteer is not qualified for this role',
          },
        ],
      });

      expect(response.warnings).toHaveLength(4);
      expect(response.warnings[0]?.conflictingId).toBeUndefined();
      expect(response.warnings[1]?.conflictingId).toBe('a2');
      expect(
        createParticipationAssignmentResponseSchema.safeParse(response).success,
      ).toBe(true);
    });
  });

  describe('completionToResponse', () => {
    it('maps a completion view', () => {
      const response = assignMapper.completionToResponse({
        participationId: MinistryParticipationId.from('p1'),
        peopleNeeded: 5,
        assignedCount: 3,
        completionPercent: 60,
      });

      expect(response).toEqual({
        participationId: 'p1',
        peopleNeeded: 5,
        assignedCount: 3,
        completionPercent: 60,
      });
    });
  });
});
