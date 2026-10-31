import { appConfig } from '@church/app-config';
import { ministryParticipation, sector } from '@church/db';
import { fromDate } from '@church/time';
import { and, eq } from 'drizzle-orm';
import { DbAssignmentManager } from '@/application/db-assignment-manager';
import { DbParticipationManager } from '@/application/db-participation-manager';
import { DbVolunteerManager } from '@/application/db-volunteer-manager';
import type { IChurchNotifications } from '@/domain/contracts/application/church-notifications';
import { DrizzleAssignmentRepository } from '@/infrastructure/repositories/drizzle-assignment.repository';
import { DrizzleAssignmentAuditRepository } from '@/infrastructure/repositories/drizzle-assignment-audit.repository';
import { DrizzleAvailabilityCheckRepository } from '@/infrastructure/repositories/drizzle-availability-check.repository';
import { DrizzleCycleRepository } from '@/infrastructure/repositories/drizzle-cycle.repository';
import { DrizzleEventRepository } from '@/infrastructure/repositories/drizzle-event.repository';
import { DrizzleEventTemplateRepository } from '@/infrastructure/repositories/drizzle-event-template.repository';
import { DrizzleEventTimeBlockRepository } from '@/infrastructure/repositories/drizzle-event-time-block.repository';
import { DrizzleMinistryRepository } from '@/infrastructure/repositories/drizzle-ministry.repository';
import { DrizzleMinistryParticipationRepository } from '@/infrastructure/repositories/drizzle-ministry-participation.repository';
import { DrizzleNotificationRepository } from '@/infrastructure/repositories/drizzle-notification.repository';
import { DrizzlePlanningEventRepository } from '@/infrastructure/repositories/drizzle-planning-event.repository';
import { DrizzleRoleRepository } from '@/infrastructure/repositories/drizzle-role.repository';
import { DrizzleSectorRepository } from '@/infrastructure/repositories/drizzle-sector.repository';
import { DrizzleShiftRepository } from '@/infrastructure/repositories/drizzle-shift.repository';
import { DrizzleUnavailableShiftRepository } from '@/infrastructure/repositories/drizzle-unavailable-shift.repository';
import { DrizzleUnitOfWork } from '@/infrastructure/repositories/drizzle-unit-of-work';
import { DrizzleUsualSetupRepository } from '@/infrastructure/repositories/drizzle-usual-setup.repository';
import { DrizzleVolunteerRepository } from '@/infrastructure/repositories/drizzle-volunteer.repository';
import { buildRole, buildSector } from '@/seeds/builders/ministry';
import { buildShift, buildShiftRequirement } from '@/seeds/builders/scheduling';
import {
  buildRoleQualification,
  buildVolunteerWithMembership,
} from '@/seeds/builders/volunteer';
import { schedulingTestDb } from '@/tests/scheduling-reshape/setup';
import { createChurchNotificationsSpy } from '@/tests/test-support/church-notifications-spy';

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
  notificationSpy: ReturnType<typeof createChurchNotificationsSpy>;
}

export interface CreateSchedulingManagersInput {
  cancelLeadTimeDays?: number;
  /** Replaces the recording spy, e.g. to write real outbox rows. */
  notifications?: IChurchNotifications;
}

export interface SeedRoleQualificationInput {
  churchId: string;
  membershipId: string;
  roleId: string;
}

export function createSchedulingManagers({
  cancelLeadTimeDays = appConfig.assignment.cancelLeadTimeDays,
  notifications,
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
  const notificationSpy = createChurchNotificationsSpy();
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
      cycleRepository: new DrizzleCycleRepository({ db: schedulingTestDb }),
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
      cycleRepository: new DrizzleCycleRepository({ db: schedulingTestDb }),
      eventTemplateRepository: new DrizzleEventTemplateRepository({
        db: schedulingTestDb,
      }),
      roleRepository: new DrizzleRoleRepository({ db: schedulingTestDb }),
      sectorRepository: new DrizzleSectorRepository({ db: schedulingTestDb }),
      notifications: notifications ?? notificationSpy,
      unitOfWork,
    }),
    volunteerManager: new DbVolunteerManager({
      volunteerRepo,
      assignmentRepo,
      unavailableShiftRepo,
      notificationRepo: new DrizzleNotificationRepository({
        db: schedulingTestDb,
      }),
      eventRepo: plainEventRepo,
      shiftRepo,
      ministryRepo,
      participationRepo,
      roleRepo: new DrizzleRoleRepository({ db: schedulingTestDb }),
      availabilityCheckRepo,
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
}

export async function seedVolunteerMembership(
  input: SeedVolunteerMembershipInput,
) {
  const { volunteer, membership } = await buildVolunteerWithMembership({
    db: schedulingTestDb,
    ...input,
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
  sectorId?: string;
}

/** Without a `sectorId`, the requirement lands in the participation Ministry's `Geral` Sector. */
export async function seedRequirement({
  sectorId,
  ...input
}: SeedRequirementInput) {
  const [participation] = await schedulingTestDb
    .select({ ministryId: ministryParticipation.ministryId })
    .from(ministryParticipation)
    .where(eq(ministryParticipation.id, input.participationId));
  const ministryId = participation?.ministryId as string;
  const [existing] = sectorId
    ? []
    : await schedulingTestDb
        .select({ id: sector.id })
        .from(sector)
        .where(
          and(eq(sector.ministryId, ministryId), eq(sector.name, 'Geral')),
        );
  const resolved =
    sectorId ??
    existing?.id ??
    (
      await buildSector({
        db: schedulingTestDb,
        churchId: input.churchId,
        ministryId,
        name: 'Geral',
      })
    ).id;
  return await buildShiftRequirement({
    db: schedulingTestDb,
    ...input,
    sectorId: resolved,
  });
}
