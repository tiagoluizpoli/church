import {
  DrizzleAssignmentAuditRepository,
  DrizzleAssignmentRepository,
  DrizzleAvailabilityCheckRepository,
  DrizzleChurchRepository,
  DrizzleCycleRepository,
  DrizzleEventRepository,
  DrizzleEventTemplateRepository,
  DrizzleEventTimeBlockRepository,
  DrizzleInvitationVerificationCodeRepository,
  DrizzleMinistryInvitationRepository,
  DrizzleMinistryParticipationRepository,
  DrizzleMinistryRepository,
  DrizzleOutboxRepository,
  DrizzlePlanningEventRepository,
  DrizzleRedemptionRepository,
  DrizzleRoleRepository,
  DrizzleSectorRepository,
  DrizzleSecurityLogRepository,
  DrizzleShiftRepository,
  DrizzleTeamRepository,
  DrizzleUnavailableShiftRepository,
  DrizzleUnitOfWork,
  DrizzleUsualSetupRepository,
  DrizzleVolunteerNotificationRepository,
  DrizzleVolunteerRepository,
  DrizzleVolunteerTransferRepository,
} from '../../infrastructure/repositories';
import type { CompositionRootDependencies } from './dependencies';

export type Repositories = Pick<
  CompositionRootDependencies,
  | 'eventRepository'
  | 'eventTemplateRepository'
  | 'cycleRepository'
  | 'planningEventRepository'
  | 'volunteerRepository'
  | 'assignmentRepository'
  | 'assignmentAuditRepository'
  | 'unavailableShiftRepository'
  | 'availabilityCheckRepository'
  | 'ministryParticipationRepository'
  | 'usualSetupRepository'
  | 'shiftRepository'
  | 'churchRepository'
  | 'ministryRepository'
  | 'invitationVerificationCodeRepository'
  | 'redemptionRepository'
  | 'volunteerTransferRepository'
  | 'securityLogRepository'
  | 'ministryInvitationRepository'
  | 'outboxRepository'
  | 'roleRepository'
  | 'sectorRepository'
  | 'teamRepository'
  | 'eventTimeBlockRepository'
  | 'volunteerNotificationRepository'
  | 'unitOfWork'
>;

export interface BuildRepositoriesInput {
  config: CompositionRootDependencies['config'];
  database: CompositionRootDependencies['db'];
  overrides: Partial<CompositionRootDependencies>;
}

export function buildRepositories({
  config,
  database,
  overrides,
}: BuildRepositoriesInput): Repositories {
  const eventRepository =
    overrides.eventRepository ?? new DrizzleEventRepository({ db: database });
  const eventTemplateRepository =
    overrides.eventTemplateRepository ??
    new DrizzleEventTemplateRepository({ db: database });
  const cycleRepository =
    overrides.cycleRepository ?? new DrizzleCycleRepository({ db: database });
  const planningEventRepository =
    overrides.planningEventRepository ??
    new DrizzlePlanningEventRepository({ db: database });
  const volunteerRepository =
    overrides.volunteerRepository ??
    new DrizzleVolunteerRepository({ db: database });
  const assignmentRepository =
    overrides.assignmentRepository ??
    new DrizzleAssignmentRepository({ db: database });
  const assignmentAuditRepository =
    overrides.assignmentAuditRepository ??
    new DrizzleAssignmentAuditRepository({ db: database });
  const unavailableShiftRepository =
    overrides.unavailableShiftRepository ??
    new DrizzleUnavailableShiftRepository({ db: database });
  const availabilityCheckRepository =
    overrides.availabilityCheckRepository ??
    new DrizzleAvailabilityCheckRepository({ db: database });
  const ministryParticipationRepository =
    overrides.ministryParticipationRepository ??
    new DrizzleMinistryParticipationRepository({ db: database });
  const usualSetupRepository =
    overrides.usualSetupRepository ??
    new DrizzleUsualSetupRepository({ db: database });
  const shiftRepository =
    overrides.shiftRepository ?? new DrizzleShiftRepository({ db: database });
  const churchRepository =
    overrides.churchRepository ?? new DrizzleChurchRepository({ db: database });
  const ministryRepository =
    overrides.ministryRepository ??
    new DrizzleMinistryRepository({ db: database });
  const invitationVerificationCodeRepository =
    overrides.invitationVerificationCodeRepository ??
    new DrizzleInvitationVerificationCodeRepository({ db: database, config });
  const redemptionRepository =
    overrides.redemptionRepository ??
    new DrizzleRedemptionRepository({ db: database, volunteerRepository });
  const volunteerTransferRepository =
    overrides.volunteerTransferRepository ??
    new DrizzleVolunteerTransferRepository({ db: database });
  const securityLogRepository =
    overrides.securityLogRepository ??
    new DrizzleSecurityLogRepository({ db: database });
  const ministryInvitationRepository =
    overrides.ministryInvitationRepository ??
    new DrizzleMinistryInvitationRepository({ db: database, config });
  const outboxRepository =
    overrides.outboxRepository ?? new DrizzleOutboxRepository({ db: database });
  const roleRepository =
    overrides.roleRepository ?? new DrizzleRoleRepository({ db: database });
  const sectorRepository =
    overrides.sectorRepository ?? new DrizzleSectorRepository({ db: database });
  const teamRepository =
    overrides.teamRepository ?? new DrizzleTeamRepository({ db: database });
  const eventTimeBlockRepository =
    overrides.eventTimeBlockRepository ??
    new DrizzleEventTimeBlockRepository({ db: database });
  const volunteerNotificationRepository =
    overrides.volunteerNotificationRepository ??
    new DrizzleVolunteerNotificationRepository({ db: database });
  const unitOfWork =
    overrides.unitOfWork ?? new DrizzleUnitOfWork({ db: database });

  return {
    eventRepository,
    eventTemplateRepository,
    cycleRepository,
    planningEventRepository,
    volunteerRepository,
    assignmentRepository,
    assignmentAuditRepository,
    unavailableShiftRepository,
    availabilityCheckRepository,
    ministryParticipationRepository,
    usualSetupRepository,
    shiftRepository,
    churchRepository,
    ministryRepository,
    invitationVerificationCodeRepository,
    redemptionRepository,
    volunteerTransferRepository,
    securityLogRepository,
    ministryInvitationRepository,
    outboxRepository,
    roleRepository,
    sectorRepository,
    teamRepository,
    eventTimeBlockRepository,
    volunteerNotificationRepository,
    unitOfWork,
  };
}
