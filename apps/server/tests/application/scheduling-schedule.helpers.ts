import { appConfig } from '@church/app-config';
import { fromDate } from '@church/time';
import { DbAssignmentManager } from '@/application/db-assignment-manager';
import { DbParticipationManager } from '@/application/db-participation-manager';
import { DbVolunteerManager } from '@/application/db-volunteer-manager';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '@/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleAvailabilityCheckRepository } from '@/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleEventRepository } from '@/infrastructure/repositories/drizzle-event.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleUnavailableShiftRepository } from '@/infrastructure/repositories/drizzle-unavailable-shift.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { DrizzleVolunteerNotificationRepository } from '@/infrastructure/repositories/drizzle-volunteer-notification.repository';
import { buildRole } from '@/seeds/builders/ministry';
import { buildShift, buildShiftRequirement } from '@/seeds/builders/scheduling';
import {
  buildRoleQualification,
  buildVolunteerWithMembership,
} from '@/seeds/builders/volunteer';
import { schedulingTestDb } from '@/tests/scheduling-reshape/setup';
import { createNotificationServiceSpy } from '@/tests/test-support/notification-service-spy';

/**
 * The managers and seed steps the assign (phase 6) and live-change
 * (phase 7) suites share. Each suite keeps its own values and defaults.
 */

export interface SchedulingManagers {
  assignmentManager: DbAssignmentManager;
  participationManager: DbParticipationManager;
  volunteerManager: DbVolunteerManager;
  assignmentRepo: DrizzleAssignmentRepository;
  participationRepo: DrizzleMinistryParticipationRepository;
  notificationSpy: ReturnType<typeof createNotificationServiceSpy>;
}

export interface CreateSchedulingManagersInput {
  cancelLeadTimeDays?: number;
}

export interface SeedRoleQualificationInput {
  churchId: string;
  membershipId: string;
  roleId: string;
}

export function createSchedulingManagers({
  cancelLeadTimeDays = appConfig.assignment.cancelLeadTimeDays,
}: CreateSchedulingManagersInput = {}): SchedulingManagers {
  const assignmentRepo = new DrizzleAssignmentRepository({
    db: schedulingTestDb,
  });
  const participationRepo = new DrizzleMinistryParticipationRepository({
    db: schedulingTestDb,
  });
  const shiftRepo = new DrizzleShiftRepository({ db: schedulingTestDb });
  const volunteerRepo = new DrizzleVolunteerRepository({
    db: schedulingTestDb,
  });
  const ministryRepo = new DrizzleMinistryRepository({ db: schedulingTestDb });
  const unavailableShiftRepo = new DrizzleUnavailableShiftRepository({
    db: schedulingTestDb,
  });
  const eventTimeBlockRepo = new DrizzleEventTimeBlockRepository({
    db: schedulingTestDb,
  });
  const eventRepo = new DrizzlePlanningEventRepository({
    db: schedulingTestDb,
  });
  const notificationSpy = createNotificationServiceSpy();
  const unitOfWork = new DrizzleUnitOfWork({ db: schedulingTestDb });
  const plainEventRepo = new DrizzleEventRepository({ db: schedulingTestDb });
  const availabilityCheckRepo = new DrizzleAvailabilityCheckRepository({
    db: schedulingTestDb,
  });

  return {
    assignmentManager: new DbAssignmentManager({
      assignmentRepo,
      auditRepo: new DrizzleAssignmentAuditRepository({ db: schedulingTestDb }),
      shiftRepository: shiftRepo,
      participationRepository: participationRepo,
      volunteerRepository: volunteerRepo,
      unavailableShiftRepository: unavailableShiftRepo,
      planningEventRepository: eventRepo,
      notificationService: notificationSpy,
      unitOfWork,
    }),
    participationManager: new DbParticipationManager({
      participationRepository: participationRepo,
      shiftRepository: shiftRepo,
      eventRepository: eventRepo,
      assignmentRepository: assignmentRepo,
      unavailableShiftRepository: unavailableShiftRepo,
      eventTimeBlockRepository: eventTimeBlockRepo,
      volunteerRepository: volunteerRepo,
      ministryRepository: ministryRepo,
      usualSetupRepository: new DrizzleUsualSetupRepository({
        db: schedulingTestDb,
      }),
      roleRepository: new DrizzleRoleRepository({ db: schedulingTestDb }),
      notificationService: notificationSpy,
      unitOfWork,
    }),
    volunteerManager: new DbVolunteerManager({
      volunteerRepo,
      assignmentRepo,
      unavailableShiftRepo,
      notificationRepo: new DrizzleVolunteerNotificationRepository({
        db: schedulingTestDb,
      }),
      eventRepo: plainEventRepo,
      shiftRepo,
      ministryRepo,
      participationRepo,
      roleRepo: new DrizzleRoleRepository({ db: schedulingTestDb }),
      availabilityCheckRepo,
      notificationService: notificationSpy,
      unitOfWork,
      config: { ...appConfig, assignment: { cancelLeadTimeDays } },
    }),
    assignmentRepo,
    participationRepo,
    notificationSpy,
  };
}

export interface SeedRoleInput {
  churchId: string;
  ministryId: string;
  name: string;
}

export async function seedRole(input: SeedRoleInput) {
  return await buildRole({ db: schedulingTestDb, ...input });
}

export interface SeedVolunteerMembershipInput {
  churchId: string;
  ministryId: string;
  name: string;
  email: string;
  ministryAccessLevel?: 'leader' | 'volunteer';
  teamId?: string;
}

export async function seedVolunteerMembership({
  teamId,
  ...input
}: SeedVolunteerMembershipInput) {
  const { volunteer, membership } = await buildVolunteerWithMembership({
    db: schedulingTestDb,
    ...input,
    teams: teamId ? [{ teamId, accessLevel: 'member' }] : [],
  });

  return { volunteer, membership };
}

export async function seedRoleQualification(
  input: SeedRoleQualificationInput,
): Promise<void> {
  await buildRoleQualification({
    db: schedulingTestDb,
    churchId: input.churchId,
    ministryMembershipId: input.membershipId,
    roleId: input.roleId,
  });
}

export interface SeedShiftInput {
  churchId: string;
  participationId: string;
  eventTimeBlockId: string;
  startTime: Date;
  endTime: Date;
  label: string;
}

export async function seedShift(input: SeedShiftInput) {
  return await buildShift({
    db: schedulingTestDb,
    churchId: input.churchId,
    participationId: input.participationId,
    eventTimeBlockId: input.eventTimeBlockId,
    start: fromDate({ date: input.startTime }),
    end: fromDate({ date: input.endTime }),
    label: input.label,
  });
}

export interface SeedRequirementInput {
  churchId: string;
  participationId: string;
  shiftId: string;
  roleId: string;
  peopleNeeded: number;
  teamId?: string;
}

export async function seedRequirement(input: SeedRequirementInput) {
  return await buildShiftRequirement({ db: schedulingTestDb, ...input });
}
