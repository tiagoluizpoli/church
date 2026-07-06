import { describe, expect, it } from 'vitest';
import { rosteringMapper } from '../../src/api/dtos/rostering.dto';
import {
  MinistryParticipationId,
  VolunteerId,
} from '../../src/domain/branded-ids';
import { Assignment } from '../../src/domain/entities/assignment';

describe('rosteringMapper', () => {
  describe('eligibleVolunteerToResponse', () => {
    it('maps a volunteer with lastServedAt present', () => {
      const lastServedAt = new Date('2026-01-01T00:00:00.000Z');

      const response = rosteringMapper.eligibleVolunteerToResponse({
        volunteerId: VolunteerId.from('v1'),
        volunteerName: 'Jane',
        isAvailable: true,
        hasConflict: false,
        lastServedAt,
      });

      expect(response).toEqual({
        volunteerId: 'v1',
        volunteerName: 'Jane',
        isAvailable: true,
        hasConflict: false,
        lastServedAt: lastServedAt.toISOString(),
      });
    });

    it('maps a volunteer with lastServedAt absent', () => {
      const response = rosteringMapper.eligibleVolunteerToResponse({
        volunteerId: VolunteerId.from('v2'),
        volunteerName: 'John',
        isAvailable: false,
        hasConflict: true,
      });

      expect(response.lastServedAt).toBeUndefined();
    });
  });

  describe('eligibleVolunteerListToResponse', () => {
    it('maps a list of volunteers', () => {
      const response = rosteringMapper.eligibleVolunteerListToResponse([
        {
          volunteerId: VolunteerId.from('v1'),
          volunteerName: 'Jane',
          isAvailable: true,
          hasConflict: false,
        },
        {
          volunteerId: VolunteerId.from('v2'),
          volunteerName: 'John',
          isAvailable: false,
          hasConflict: true,
          lastServedAt: new Date('2026-01-05T00:00:00.000Z'),
        },
      ]);

      expect(response.volunteers).toHaveLength(2);
      expect(response.volunteers[0]?.volunteerId).toBe('v1');
      expect(response.volunteers[1]?.lastServedAt).toBeDefined();
    });

    it('maps an empty list', () => {
      const response = rosteringMapper.eligibleVolunteerListToResponse([]);

      expect(response.volunteers).toEqual([]);
    });
  });

  describe('assignmentResultToResponse', () => {
    const buildAssignment = () =>
      new Assignment(
        {
          churchId: 'c1',
          slotId: 's1',
          volunteerId: 'v1',
          roleId: 'r1',
        },
        'a1',
      );

    it('maps a result with empty warnings', () => {
      const assignment = buildAssignment();

      const response = rosteringMapper.assignmentResultToResponse({
        assignment,
        warnings: [],
      });

      expect(response.assignment.id).toBe('a1');
      expect(response.warnings).toEqual([]);
    });

    it('maps a result with warnings including conflictingId present and absent', () => {
      const assignment = buildAssignment();

      const response = rosteringMapper.assignmentResultToResponse({
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
        ],
      });

      expect(response.warnings).toHaveLength(3);
      expect(response.warnings[0]?.conflictingId).toBeUndefined();
      expect(response.warnings[1]?.conflictingId).toBe('a2');
    });
  });

  describe('completionToResponse', () => {
    it('maps a completion view', () => {
      const response = rosteringMapper.completionToResponse({
        participationId: MinistryParticipationId.from('p1'),
        requiredCount: 5,
        assignedCount: 3,
        completionPercent: 60,
      });

      expect(response).toEqual({
        participationId: 'p1',
        requiredCount: 5,
        assignedCount: 3,
        completionPercent: 60,
      });
    });
  });
});
