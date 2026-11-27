import { DbAssignmentProposalManager } from '@/application/db-assignment-proposal-manager';
import { DbParticipationReader } from '@/application/db-participation-reader';
import { DbPrepareManager } from '@/application/db-prepare-manager';
import { DbScheduleBuilderReader } from '@/application/db-schedule-builder-reader';
import { DbScheduleChangeReader } from '@/application/db-schedule-change-reader';
import { DbSchedulePublisher } from '@/application/db-schedule-publisher';
import { DbScheduleReadModel } from '@/application/db-schedule-read-model';
import { DbUsualSetupManager } from '@/application/db-usual-setup-manager';
import type { IAssignmentLifecycle } from '@/domain/contracts/application/assignment-lifecycle';
import type { IAssignmentProposalManager } from '@/domain/contracts/application/assignment-proposal-manager';
import type { IChurchNotifications } from '@/domain/contracts/application/church-notifications';
import type { IPrepareManager } from '@/domain/contracts/application/prepare-manager';
import type { IScheduleBuilderReader } from '@/domain/contracts/application/schedule-builder-reader';
import type { ISchedulePublisher } from '@/domain/contracts/application/schedule-publisher';
import type { IScheduleReadModel } from '@/domain/contracts/application/schedule-read-model';
import type { IUsualSetupManager } from '@/domain/contracts/application/usual-setup-manager';
import type { IUsualSetupStaffingSeeder } from '@/domain/contracts/application/usual-setup-staffing-seeder';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { AssignmentProposalApplicationRepository } from '@/domain/contracts/infrastructure/assignment-proposal-application.repository';
import type { AvailabilityCheckRepository } from '@/domain/contracts/infrastructure/availability-check.repository';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { EventTemplateRepository } from '@/domain/contracts/infrastructure/event-template.repository';
import type { EventTimeBlockRepository } from '@/domain/contracts/infrastructure/event-time-block.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';
import type { RoleRepository } from '@/domain/contracts/infrastructure/role.repository';
import type { SectorRepository } from '@/domain/contracts/infrastructure/sector.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { SwapRequestRepository } from '@/domain/contracts/infrastructure/swap-request.repository';
import type { UnavailableShiftRepository } from '@/domain/contracts/infrastructure/unavailable-shift.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { UsualSetupRepository } from '@/domain/contracts/infrastructure/usual-setup.repository';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';
import { ShiftSplitter } from '@/domain/services/scheduling/shift-splitter';

/**
 * The Prepare, Usual setup, builder, Proposal, Schedule read model and
 * publisher modules the composition root builds, built the same way for tests
 * from one bag of repositories (a suite's fakes or Drizzle ones).
 */
export interface ParticipationModuleRepositories {
  availabilityCheckRepository: AvailabilityCheckRepository;
  participationRepository: MinistryParticipationRepository;
  shiftRepository: ShiftRepository;
  eventRepository: PlanningEventRepository;
  assignmentRepository: AssignmentRepository;
  proposalApplicationRepository: AssignmentProposalApplicationRepository;
  unavailableShiftRepository: UnavailableShiftRepository;
  eventTimeBlockRepository: EventTimeBlockRepository;
  volunteerRepository: VolunteerRepository;
  ministryRepository: MinistryRepository;
  usualSetupRepository: UsualSetupRepository;
  eventTemplateRepository: EventTemplateRepository;
  cycleRepository: CycleRepository;
  roleRepository: RoleRepository;
  sectorRepository: SectorRepository;
  churchRepository: ChurchRepository;
  swapRequestRepo: SwapRequestRepository;
  unitOfWork: UnitOfWork;
  assignmentLifecycle: IAssignmentLifecycle;
  staffingSeeder: IUsualSetupStaffingSeeder;
  notifications: IChurchNotifications;
}

export interface ParticipationModules {
  prepareManager: IPrepareManager;
  usualSetupManager: IUsualSetupManager;
  scheduleBuilderReader: IScheduleBuilderReader;
  assignmentProposalManager: IAssignmentProposalManager;
  scheduleReadModel: IScheduleReadModel;
  schedulePublisher: ISchedulePublisher;
}

export function buildParticipationModules(
  repositories: ParticipationModuleRepositories,
): ParticipationModules {
  const scheduleChangeReader = new DbScheduleChangeReader({
    assignmentRepository: repositories.assignmentRepository,
    eventRepository: repositories.eventRepository,
    participationRepository: repositories.participationRepository,
    roleRepository: repositories.roleRepository,
    shiftRepository: repositories.shiftRepository,
  });
  const participationReader = new DbParticipationReader({
    assignmentRepository: repositories.assignmentRepository,
    availabilityCheckRepository: repositories.availabilityCheckRepository,
    ministryRepository: repositories.ministryRepository,
    participationRepository: repositories.participationRepository,
    roleRepository: repositories.roleRepository,
    sectorRepository: repositories.sectorRepository,
    shiftRepository: repositories.shiftRepository,
    unavailableShiftRepository: repositories.unavailableShiftRepository,
    volunteerRepository: repositories.volunteerRepository,
  });
  const prepareManager = new DbPrepareManager({
    shiftSplitter: new ShiftSplitter(),
    assignmentRepository: repositories.assignmentRepository,
    churchRepository: repositories.churchRepository,
    cycleRepository: repositories.cycleRepository,
    eventRepository: repositories.eventRepository,
    eventTimeBlockRepository: repositories.eventTimeBlockRepository,
    ministryRepository: repositories.ministryRepository,
    participationRepository: repositories.participationRepository,
    shiftRepository: repositories.shiftRepository,
    staffingSeeder: repositories.staffingSeeder,
    unavailableShiftRepository: repositories.unavailableShiftRepository,
    unitOfWork: repositories.unitOfWork,
    participationReader,
  });
  const usualSetupManager = new DbUsualSetupManager({
    eventTemplateRepository: repositories.eventTemplateRepository,
    ministryRepository: repositories.ministryRepository,
    unitOfWork: repositories.unitOfWork,
    usualSetupRepository: repositories.usualSetupRepository,
    participationReader,
  });
  const scheduleBuilderReader = new DbScheduleBuilderReader({
    assignmentRepository: repositories.assignmentRepository,
    cycleRepository: repositories.cycleRepository,
    eventRepository: repositories.eventRepository,
    ministryRepository: repositories.ministryRepository,
    participationRepository: repositories.participationRepository,
    roleRepository: repositories.roleRepository,
    shiftRepository: repositories.shiftRepository,
    unavailableShiftRepository: repositories.unavailableShiftRepository,
    unitOfWork: repositories.unitOfWork,
    volunteerRepository: repositories.volunteerRepository,
    scheduleChangeReader,
    participationReader,
  });
  const assignmentProposalManager = new DbAssignmentProposalManager({
    assignmentRepository: repositories.assignmentRepository,
    availabilityCheckRepository: repositories.availabilityCheckRepository,
    cycleRepository: repositories.cycleRepository,
    eventRepository: repositories.eventRepository,
    assignmentLifecycle: repositories.assignmentLifecycle,
    ministryRepository: repositories.ministryRepository,
    participationRepository: repositories.participationRepository,
    proposalApplicationRepository: repositories.proposalApplicationRepository,
    shiftRepository: repositories.shiftRepository,
    unitOfWork: repositories.unitOfWork,
    participationReader,
  });
  const scheduleReadModel = new DbScheduleReadModel({
    churchRepository: repositories.churchRepository,
    ministryRepository: repositories.ministryRepository,
    participationRepository: repositories.participationRepository,
    unitOfWork: repositories.unitOfWork,
    scheduleChangeReader,
  });
  const schedulePublisher = new DbSchedulePublisher({
    churchRepository: repositories.churchRepository,
    cycleRepository: repositories.cycleRepository,
    eventRepository: repositories.eventRepository,
    ministryRepository: repositories.ministryRepository,
    notifications: repositories.notifications,
    participationRepository: repositories.participationRepository,
    swapRequestRepo: repositories.swapRequestRepo,
    unitOfWork: repositories.unitOfWork,
    volunteerRepository: repositories.volunteerRepository,
    scheduleChangeReader,
  });
  return {
    prepareManager,
    usualSetupManager,
    scheduleBuilderReader,
    assignmentProposalManager,
    scheduleReadModel,
    schedulePublisher,
  };
}
