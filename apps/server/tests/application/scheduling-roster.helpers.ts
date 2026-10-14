import { appConfig } from '@church/app-config';
import { fromDate } from '@church/time';
import { buildRole } from '../../seeds/builders/ministry';
import {
  buildShift,
  buildSlotRequirement,
} from '../../seeds/builders/scheduling';
import {
  buildRoleQualification,
  buildVolunteerWithMembership,
} from '../../seeds/builders/volunteer';
import { DbAssignmentManager } from '../../src/application/db-assignment-manager';
import { DbParticipationManager } from '../../src/application/db-participation-manager';
import { DbVolunteerManager } from '../../src/application/db-volunteer-manager';
import { DrizzleAssignmentRepository } from '../../src/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '../../src/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleAvailabilityRepository } from '../../src/infrastructure/repositories/drizzle-availability.repository';
import { DrizzleAvailabilityCheckRepository } from '../../src/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleEventRepository } from '../../src/infrastructure/repositories/drizzle-event.repository';
import { DrizzleMinistryRepository } from '../../src/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '../../src/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleMinistryServingProfileRepository } from '../../src/infrastructure/repositories/drizzle-ministry-serving-profile.repository';
import { DrizzlePlanningEventRepository } from '../../src/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleRoleRepository } from '../../src/infrastructure/repositories/drizzle-role.repository';
import { DrizzleShiftRepository } from '../../src/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleTeamRepository } from '../../src/infrastructure/repositories/drizzle-team.repository';
import { DrizzleTimeSlotRepository } from '../../src/infrastructure/repositories/drizzle-time-slot.repository';
import { DrizzleUnitOfWork } from '../../src/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleVolunteerRepository } from '../../src/infrastructure/repositories/drizzle-volunteer.repository';
import { DrizzleVolunteerNotificationRepository } from '../../src/infrastructure/repositories/drizzle-volunteer-notification.repository';
import { createNotificationServiceSpy } from '../../src/test-support/notification-service-spy';
import { schedulingTestDb } from '../scheduling-reshape/setup';

/**
 * The managers and seed steps the rostering (phase 6) and live-change
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
  const availabilityRepo = new DrizzleAvailabilityRepository({
    db: schedulingTestDb,
  });
  const timeSlotRepo = new DrizzleTimeSlotRepository({ db: schedulingTestDb });
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
      availabilityRepository: availabilityRepo,
      planningEventRepository: eventRepo,
      notificationService: notificationSpy,
      unitOfWork,
    }),
    participationManager: new DbParticipationManager({
      participationRepository: participationRepo,
      shiftRepository: shiftRepo,
      eventRepository: eventRepo,
      assignmentRepository: assignmentRepo,
      availabilityRepository: availabilityRepo,
      timeSlotRepository: timeSlotRepo,
      volunteerRepository: volunteerRepo,
      ministryRepository: ministryRepo,
      servingProfileRepository: new DrizzleMinistryServingProfileRepository({
        db: schedulingTestDb,
      }),
      roleRepository: new DrizzleRoleRepository({ db: schedulingTestDb }),
      notificationService: notificationSpy,
      unitOfWork,
    }),
    volunteerManager: new DbVolunteerManager({
      volunteerRepo,
      assignmentRepo,
      availabilityRepo,
      notificationRepo: new DrizzleVolunteerNotificationRepository({
        db: schedulingTestDb,
      }),
      eventRepo: plainEventRepo,
      shiftRepo,
      ministryRepo,
      participationRepo,
      roleRepo: new DrizzleRoleRepository({ db: schedulingTestDb }),
      teamRepo: new DrizzleTeamRepository({ db: schedulingTestDb }),
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
    ministryVolunteerId: input.membershipId,
    roleId: input.roleId,
  });
}

export interface SeedShiftInput {
  churchId: string;
  participationId: string;
  timeSlotId: string;
  startTime: Date;
  endTime: Date;
  label: string;
}

export async function seedShift(input: SeedShiftInput) {
  return await buildShift({
    db: schedulingTestDb,
    churchId: input.churchId,
    participationId: input.participationId,
    timeSlotId: input.timeSlotId,
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
  requiredCount: number;
  teamId?: string;
}

export async function seedRequirement(input: SeedRequirementInput) {
  return await buildSlotRequirement({ db: schedulingTestDb, ...input });
}
