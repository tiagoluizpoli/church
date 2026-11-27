import type { CompositionRootDependencies } from './dependencies.types';

export type Repositories = Pick<
  CompositionRootDependencies,
  | 'eventRepository'
  | 'eventTemplateRepository'
  | 'templatePrecedenceRepository'
  | 'cycleRepository'
  | 'planningEventRepository'
  | 'volunteerRepository'
  | 'assignmentRepository'
  | 'swapRequestRepository'
  | 'assignmentAuditRepository'
  | 'assignmentProposalApplicationRepository'
  | 'unavailableShiftRepository'
  | 'availabilityCheckRepository'
  | 'ministryParticipationRepository'
  | 'usualSetupRepository'
  | 'shiftRepository'
  | 'churchRepository'
  | 'publicEventRepository'
  | 'churchProgrammeRepository'
  | 'ministryRepository'
  | 'invitationVerificationCodeRepository'
  | 'redemptionRepository'
  | 'volunteerTransferRepository'
  | 'securityLogRepository'
  | 'ministryInvitationRepository'
  | 'outboxRepository'
  | 'roleRepository'
  | 'sectorRepository'
  | 'eventTimeBlockRepository'
  | 'notificationRepository'
  | 'invitationListRepository'
  | 'peopleListRepository'
  | 'setupProgressRepository'
  | 'churchAccessRepository'
  | 'ministryMembershipRepository'
  | 'unitOfWork'
>;

export interface BuildRepositoriesInput {
  config: CompositionRootDependencies['config'];
  database: CompositionRootDependencies['db'];
  overrides: Partial<CompositionRootDependencies>;
}
