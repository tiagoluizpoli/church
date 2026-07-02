// biome-ignore-all lint/suspicious/noExplicitAny: needed for test mocks

import { describe, expect, it } from 'vitest';
import type {
  AssignmentId,
  ChurchId,
  MinistryId,
  RoleId,
  TimeSlotId,
  UserId,
  VolunteerId,
} from '../../../src/domain/branded-ids';
import { ConflictValidationService } from '../../../src/domain/conflict/conflict-validation-service';
import type { ConflictReport } from '../../../src/domain/conflict/types';
import type { AssignmentRepository } from '../../../src/domain/contracts/infrastructure/assignment.repository';
import type { AssignmentAuditRepository } from '../../../src/domain/contracts/infrastructure/assignment-audit.repository';
import type { VolunteerRepository } from '../../../src/domain/contracts/infrastructure/volunteer.repository';

describe('Coverage L2: Conflict & Validation Service Data Access', () => {
  it('should verify all required L2 data can be retrieved and validated', async () => {
    // 1. Mock repositories using the defined interfaces
    const mockVolunteerRepo: VolunteerRepository = {
      hasRoleQualification: async (
        _churchId: ChurchId,
        volunteerId: VolunteerId,
        roleId: RoleId,
      ) => {
        return volunteerId === 'volunteer-1' && roleId === 'role-1';
      },
      hasMembershipInMinistry: async (
        _churchId: ChurchId,
        volunteerId: VolunteerId,
        ministryId: MinistryId,
      ) => {
        return volunteerId === 'volunteer-1' && ministryId === 'ministry-1';
      },
    } as any;

    const mockAssignmentRepo: AssignmentRepository = {
      findBySlotAndVolunteer: async (
        _churchId: ChurchId,
        _slotId: TimeSlotId,
        _volunteerId: VolunteerId,
      ) => {
        return null; // no duplicate assignments
      },
      countByVolunteerInRange: async (
        _churchId: ChurchId,
        _volunteerId: VolunteerId,
        _startTime: Date,
        _endTime: Date,
        _statusFilter?: any,
      ) => {
        return 2; // volunteer has served 2 times in range
      },
    } as any;

    const mockAuditRepo: AssignmentAuditRepository = {
      create: async (churchId: ChurchId, input: any) => {
        return {
          id: 'audit-1' as any,
          churchId,
          ...input,
          timestamp: new Date(),
        } as any;
      },
    } as any;

    // 2. Fetch all parameters required for L2 constraints from the repositories
    const churchId = 'church-1' as ChurchId;
    const volunteerId = 'volunteer-1' as VolunteerId;
    const roleId = 'role-1' as RoleId;
    const ministryId = 'ministry-1' as MinistryId;
    const slotId = 'slot-1' as TimeSlotId;

    const isQualified = await mockVolunteerRepo.hasRoleQualification(
      churchId,
      volunteerId,
      roleId,
    );
    const isMember = await mockVolunteerRepo.hasMembershipInMinistry(
      churchId,
      volunteerId,
      ministryId,
    );
    const existingAssignment = await mockAssignmentRepo.findBySlotAndVolunteer(
      churchId,
      slotId,
      volunteerId,
    );
    const serviceCount = await mockAssignmentRepo.countByVolunteerInRange(
      churchId,
      volunteerId,
      new Date('2024-06-01T00:00:00Z'),
      new Date('2024-06-30T23:59:59Z'),
      ['confirmed'],
    );

    // 3. Assemble inputs and validate using ConflictValidationService
    const validationRequest = {
      churchId,
      volunteerId,
      roleId,
      volunteerQualifiedRoleIds: isQualified ? [roleId] : [],
      ministryId,
      volunteerMinistryIds: isMember ? [ministryId] : [],
      eventStartTime: new Date('2024-06-15T10:00:00Z'),
      now: new Date('2024-06-10T10:00:00Z'),
      slotId,
      existingSlotIds: existingAssignment ? [existingAssignment.slotId] : [],
      availabilityResult: { status: 'AVAILABLE' as const },
      serviceCount,
      fairnessThreshold: 5,
    };

    const validationResult =
      ConflictValidationService.validate(validationRequest);
    expect(validationResult.hasConflicts).toBe(false);

    // 4. Test Override flow and persistence
    const conflictReport: ConflictReport = {
      hasConflicts: true,
      issues: [
        {
          type: 'UNAVAILABLE',
          details: 'Volunteer is unavailable',
          conflictingId: 'avail-1' as any,
        },
      ],
    };

    const overrideRequest = {
      churchId,
      assignmentId: 'assignment-1' as AssignmentId,
      caller: {
        userId: 'leader-1' as UserId,
        systemRole: 'leader' as const,
        ministryId,
      },
      overrideReason: 'Approved by lead',
      targetMinistryId: ministryId,
      now: new Date(),
    };

    const auditEntity = ConflictValidationService.authorizeOverride(
      overrideRequest,
      conflictReport,
    );

    // Persist the audit using the repository
    const persistedAudit = await mockAuditRepo.create(churchId, {
      assignmentId: auditEntity.assignmentId,
      actorId: auditEntity.actorId,
      action: auditEntity.action,
      reason: auditEntity.reason,
      overrideConflictTypes: auditEntity.overrideConflictTypes,
    });

    expect(persistedAudit).toBeDefined();
    expect(persistedAudit.id).toBe('audit-1');
  });
});
