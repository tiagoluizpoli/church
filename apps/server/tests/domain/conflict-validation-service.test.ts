import { describe, expect, it } from 'vitest';
import { ConflictValidationService } from '../../src/domain/conflict/conflict-validation-service';
import { HardConstraintError } from '../../src/domain/conflict/errors/hard-constraint-error';
import { InvalidOverrideReasonError } from '../../src/domain/conflict/errors/invalid-override-reason-error';
import { UnauthorizedOverrideError } from '../../src/domain/conflict/errors/unauthorized-override-error';
import type {
  ConflictReport,
  OverrideRequest,
  ValidationRequest,
} from '../../src/domain/conflict/types';
import { AssignmentAudit } from '../../src/domain/entities/assignment-audit';

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

const now = new Date('2026-05-20T10:00:00Z');
const futureEvent = new Date('2026-05-21T09:00:00Z');

const baseRequest: ValidationRequest = {
  churchId: 'chu_123',
  volunteerId: 'vol_456',
  ministryId: 'min_789',
  roleId: 'role_abc',
  slotId: 'slot_def',
  eventStartTime: futureEvent,
  now,
  availabilityResult: { status: 'AVAILABLE' },
  existingSlotIds: [],
  serviceCount: 0,
  fairnessThreshold: 5,
  volunteerQualifiedRoleIds: ['role_abc'],
  volunteerMinistryIds: ['min_789'],
};

const conflictReport: ConflictReport = {
  hasConflicts: true,
  issues: [{ type: 'UNAVAILABLE', details: 'Volunteer is unavailable' }],
};

const baseOverride: OverrideRequest = {
  churchId: 'chu_123',
  assignmentId: 'assign_001',
  overrideReason: 'Ministry need',
  caller: {
    userId: 'leader_001',
    isChurchAdmin: false,
    isMinistryLeader: true,
    ministryId: 'min_789',
  },
  targetMinistryId: 'min_789',
  now,
};

// ---------------------------------------------------------------------------
// US1: Hard Constraints
// ---------------------------------------------------------------------------

describe('ConflictValidationService', () => {
  describe('Hard Constraints', () => {
    it('does NOT throw when volunteer is fully eligible', () => {
      expect(() =>
        ConflictValidationService.validate(baseRequest),
      ).not.toThrow();
    });

    it('throws HardConstraintError with NOT_QUALIFIED when roleId not in qualifiedRoleIds', () => {
      const req = { ...baseRequest, roleId: 'role_unknown' };
      expect(() => ConflictValidationService.validate(req)).toThrow(
        HardConstraintError,
      );
      try {
        ConflictValidationService.validate(req);
      } catch (e) {
        expect(e).toBeInstanceOf(HardConstraintError);
        expect((e as HardConstraintError).reason).toBe('NOT_QUALIFIED');
      }
    });

    it('throws HardConstraintError with NOT_IN_MINISTRY when ministryId not in volunteerMinistryIds', () => {
      const req = { ...baseRequest, ministryId: 'min_other' };
      expect(() => ConflictValidationService.validate(req)).toThrow(
        HardConstraintError,
      );
      try {
        ConflictValidationService.validate(req);
      } catch (e) {
        expect(e).toBeInstanceOf(HardConstraintError);
        expect((e as HardConstraintError).reason).toBe('NOT_IN_MINISTRY');
      }
    });

    it('throws HardConstraintError with EVENT_IN_PAST when eventStartTime <= now', () => {
      const req = {
        ...baseRequest,
        eventStartTime: new Date('2026-05-19T00:00:00Z'),
      };
      expect(() => ConflictValidationService.validate(req)).toThrow(
        HardConstraintError,
      );
      try {
        ConflictValidationService.validate(req);
      } catch (e) {
        expect(e).toBeInstanceOf(HardConstraintError);
        expect((e as HardConstraintError).reason).toBe('EVENT_IN_PAST');
      }
    });

    it('treats eventStartTime exactly equal to now as past (strict >)', () => {
      const req = { ...baseRequest, eventStartTime: now };
      expect(() => ConflictValidationService.validate(req)).toThrow(
        HardConstraintError,
      );
      try {
        ConflictValidationService.validate(req);
      } catch (e) {
        expect(e).toBeInstanceOf(HardConstraintError);
        expect((e as HardConstraintError).reason).toBe('EVENT_IN_PAST');
      }
    });

    it('throws HardConstraintError with DUPLICATE_ASSIGNMENT when slotId is in existingAssignmentIds', () => {
      const req = { ...baseRequest, existingSlotIds: ['slot_def'] };
      expect(() => ConflictValidationService.validate(req)).toThrow(
        HardConstraintError,
      );
      try {
        ConflictValidationService.validate(req);
      } catch (e) {
        expect(e).toBeInstanceOf(HardConstraintError);
        expect((e as HardConstraintError).reason).toBe('DUPLICATE_ASSIGNMENT');
      }
    });

    it('evaluates NOT_QUALIFIED before NOT_IN_MINISTRY (ordering guarantee)', () => {
      const req = {
        ...baseRequest,
        roleId: 'role_unknown',
        ministryId: 'min_other',
      };
      try {
        ConflictValidationService.validate(req);
      } catch (e) {
        expect(e).toBeInstanceOf(HardConstraintError);
        expect((e as HardConstraintError).reason).toBe('NOT_QUALIFIED');
      }
    });

    it('does not leak cross-tenant data — churchId mismatch volunteers rejected via NOT_IN_MINISTRY', () => {
      // Simulates data isolation: volunteer from another church has no ministry overlap
      const req = {
        ...baseRequest,
        ministryId: 'min_other_church',
        volunteerMinistryIds: [],
      };
      expect(() => ConflictValidationService.validate(req)).toThrow(
        HardConstraintError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // US2: Soft Conflicts
  // ---------------------------------------------------------------------------

  describe('Soft Conflicts', () => {
    it('returns NoConflict when volunteer is AVAILABLE and under fairness threshold', () => {
      const result = ConflictValidationService.validate(baseRequest);
      expect(result.hasConflicts).toBe(false);
    });

    it('returns ConflictReport with UNAVAILABLE when availabilityResult.status is UNAVAILABLE', () => {
      const req = {
        ...baseRequest,
        availabilityResult: {
          status: 'UNAVAILABLE' as const,
          conflictingId: 'blk_001',
        },
      };
      const result = ConflictValidationService.validate(req);
      expect(result.hasConflicts).toBe(true);
      if (result.hasConflicts) {
        const [first] = result.issues;
        expect(first?.type).toBe('UNAVAILABLE');
        expect(first?.conflictingId).toBe('blk_001');
      }
    });

    it('returns ConflictReport with DOUBLE_BOOKED when availabilityResult.status is DOUBLE_BOOKED', () => {
      const req = {
        ...baseRequest,
        availabilityResult: {
          status: 'DOUBLE_BOOKED' as const,
          conflictingId: 'asgn_002',
        },
      };
      const result = ConflictValidationService.validate(req);
      expect(result.hasConflicts).toBe(true);
      if (result.hasConflicts) {
        const [first] = result.issues;
        expect(first?.type).toBe('DOUBLE_BOOKED');
      }
    });

    it('returns ConflictReport with FAIRNESS_EXCEEDED when serviceCount >= fairnessThreshold (> 0)', () => {
      const req = { ...baseRequest, serviceCount: 5, fairnessThreshold: 5 };
      const result = ConflictValidationService.validate(req);
      expect(result.hasConflicts).toBe(true);
      if (result.hasConflicts) {
        const [first] = result.issues;
        expect(first?.type).toBe('FAIRNESS_EXCEEDED');
        expect(first?.metadata?.serviceCount).toBe(5);
        expect(first?.metadata?.fairnessThreshold).toBe(5);
      }
    });

    it('skips fairness check when fairnessThreshold is 0', () => {
      const req = { ...baseRequest, serviceCount: 100, fairnessThreshold: 0 };
      const result = ConflictValidationService.validate(req);
      expect(result.hasConflicts).toBe(false);
    });

    it('accumulates ALL issues when multiple soft conflicts exist simultaneously', () => {
      const req = {
        ...baseRequest,
        availabilityResult: { status: 'UNAVAILABLE' as const },
        serviceCount: 5,
        fairnessThreshold: 5,
      };
      const result = ConflictValidationService.validate(req);
      expect(result.hasConflicts).toBe(true);
      if (result.hasConflicts) {
        const types = result.issues.map((i) => i.type);
        expect(types).toContain('UNAVAILABLE');
        expect(types).toContain('FAIRNESS_EXCEEDED');
        expect(result.issues.length).toBe(2);
      }
    });

    it('sets hasConflicts true when at least one issue exists', () => {
      const req = {
        ...baseRequest,
        availabilityResult: { status: 'UNAVAILABLE' as const },
      };
      const result = ConflictValidationService.validate(req);
      expect(result.hasConflicts).toBe(true);
    });

    it('hard constraints throw even when soft conflicts would also exist', () => {
      const req = {
        ...baseRequest,
        roleId: 'role_unknown',
        availabilityResult: { status: 'UNAVAILABLE' as const },
        serviceCount: 10,
        fairnessThreshold: 5,
      };
      expect(() => ConflictValidationService.validate(req)).toThrow(
        HardConstraintError,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // US3: Override Audit Creation
  // ---------------------------------------------------------------------------

  describe('Override Audit Creation', () => {
    it('returns an AssignmentAudit with correct actorId, churchId, reason, and overrideConflictTypes', () => {
      const audit = ConflictValidationService.authorizeOverride(
        baseOverride,
        conflictReport,
      );
      expect(audit).toBeInstanceOf(AssignmentAudit);
      expect(audit.actorId).toBe('leader_001');
      expect(audit.churchId).toBe('chu_123');
      expect(audit.reason).toBe('Ministry need');
      expect(audit.overrideConflictTypes).toContain('UNAVAILABLE');
    });

    it('overrideConflictTypes contains all conflict types from the ConflictReport', () => {
      const report: ConflictReport = {
        hasConflicts: true,
        issues: [
          { type: 'UNAVAILABLE', details: 'Unavailable' },
          { type: 'FAIRNESS_EXCEEDED', details: 'Over threshold' },
        ],
      };
      const audit = ConflictValidationService.authorizeOverride(
        baseOverride,
        report,
      );
      expect(audit.overrideConflictTypes).toEqual([
        'UNAVAILABLE',
        'FAIRNESS_EXCEEDED',
      ]);
    });

    it('sets action to created on the returned audit', () => {
      const audit = ConflictValidationService.authorizeOverride(
        baseOverride,
        conflictReport,
      );
      expect(audit.action).toBe('created');
    });

    it('sets timestamp on the returned audit', () => {
      const audit = ConflictValidationService.authorizeOverride(
        baseOverride,
        conflictReport,
      );
      expect(audit.timestamp).toEqual(now);
    });
  });

  // ---------------------------------------------------------------------------
  // US4: Override Authorization
  // ---------------------------------------------------------------------------

  describe('Override Authorization', () => {
    it('ministry leader with matching ministryId → override accepted, audit returned', () => {
      const req: OverrideRequest = {
        ...baseOverride,
        caller: {
          userId: 'u1',
          isChurchAdmin: false,
          isMinistryLeader: true,
          ministryId: 'min_789',
        },
        targetMinistryId: 'min_789',
      };
      expect(() =>
        ConflictValidationService.authorizeOverride(req, conflictReport),
      ).not.toThrow();
    });

    it('ministry leader with non-matching ministryId → permission error thrown', () => {
      const req: OverrideRequest = {
        ...baseOverride,
        caller: {
          userId: 'u1',
          isChurchAdmin: false,
          isMinistryLeader: true,
          ministryId: 'min_other',
        },
        targetMinistryId: 'min_789',
      };
      expect(() =>
        ConflictValidationService.authorizeOverride(req, conflictReport),
      ).toThrow(UnauthorizedOverrideError);
    });

    it('church admin with any ministryId → override accepted', () => {
      const req: OverrideRequest = {
        ...baseOverride,
        caller: {
          userId: 'u1',
          isChurchAdmin: true,
          isMinistryLeader: false,
          ministryId: 'min_other',
        },
      };
      expect(() =>
        ConflictValidationService.authorizeOverride(req, conflictReport),
      ).not.toThrow();
    });

    it('church admin without ministryId → override accepted (admin is church-wide)', () => {
      const req: OverrideRequest = {
        ...baseOverride,
        caller: { userId: 'u1', isChurchAdmin: true, isMinistryLeader: false },
      };
      expect(() =>
        ConflictValidationService.authorizeOverride(req, conflictReport),
      ).not.toThrow();
    });

    it('ordinary ministry member → permission error thrown', () => {
      const req: OverrideRequest = {
        ...baseOverride,
        caller: { userId: 'u1', isChurchAdmin: false, isMinistryLeader: false },
      };
      expect(() =>
        ConflictValidationService.authorizeOverride(req, conflictReport),
      ).toThrow(UnauthorizedOverrideError);
    });

    it('TeamLeader without ministry leadership → permission error thrown', () => {
      const req: OverrideRequest = {
        ...baseOverride,
        caller: { userId: 'u1', isChurchAdmin: false, isMinistryLeader: false },
      };
      expect(() =>
        ConflictValidationService.authorizeOverride(req, conflictReport),
      ).toThrow(UnauthorizedOverrideError);
    });

    it('empty overrideReason → rejected before role check', () => {
      const req: OverrideRequest = { ...baseOverride, overrideReason: '' };
      expect(() =>
        ConflictValidationService.authorizeOverride(req, conflictReport),
      ).toThrow(InvalidOverrideReasonError);
    });

    it('whitespace-only overrideReason → rejected before role check', () => {
      const req: OverrideRequest = { ...baseOverride, overrideReason: '   ' };
      expect(() =>
        ConflictValidationService.authorizeOverride(req, conflictReport),
      ).toThrow(InvalidOverrideReasonError);
    });
  });
});
