import type { Instant } from '@church/time';
import type {
  ChurchId,
  CycleId,
  MinistryId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { EventWithEventTimeBlocks } from '../../entities/event';
import type { MinistryParticipation } from '../../entities/ministry-participation';
import type { Shift } from '../../entities/shift';
import type {
  AppliedProposalAddition,
  AssignmentProposal,
  ProposeAssignmentsInput,
  ProposedAddition,
  ReviewedAddition,
} from '../../services/scheduling/assignment-proposal.types';
import type { IAssignmentLifecycle } from './assignment-lifecycle';
import type { IParticipationReader } from './participation-reader';
import type { AssignmentRepository } from '@/domain/contracts/infrastructure/assignment.repository';
import type { AssignmentProposalApplicationRepository } from '@/domain/contracts/infrastructure/assignment-proposal-application.repository';
import type { AvailabilityCheckRepository } from '@/domain/contracts/infrastructure/availability-check.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';
import type { ShiftRepository } from '@/domain/contracts/infrastructure/shift.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

export interface GetAssignmentProposalInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
}

export interface ProposedAdditionView extends ProposedAddition {
  volunteerName: string;
}

/** A side-effect-free preview: nothing here is stored or written. */
export interface AssignmentProposalView
  extends Omit<AssignmentProposal, 'additions'> {
  additions: ProposedAdditionView[];
  /** Binds Apply to exactly these additions (ADR 0013). */
  reviewToken: string;
}

export interface ApplyAssignmentProposalInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  actorId: UserId;
  /** Client-generated per reviewed preview; resent on every retry. */
  applicationKey: string;
  reviewToken: string;
  additions: ReviewedAddition[];
  /** Reviewed pairs to leave out; the token still covers `additions` whole. */
  excludedAdditions: ReviewedAddition[];
}

/** The committed outcome; `replayed` when a retry recovered it. */
export interface AssignmentProposalOutcomeView {
  applicationKey: string;
  appliedAt: Instant;
  replayed: boolean;
  additions: AppliedProposalAddition[];
}

export interface RefuseCancelledAdditionsInput {
  churchId: ChurchId;
  eventGroups: EventWithEventTimeBlocks[];
  additions: ReviewedAddition[];
  tx: TransactionContext;
}

export interface ToProposalAssignmentsInput {
  /** Active Assignments of the target Schedule, by any Volunteer. */
  scheduleAssignments: Assignment[];
  /** Active Assignments of the candidates, in any Ministry. */
  candidateAssignments: Assignment[];
  shiftsById: Map<string, Shift>;
  cycleBlockIds: Set<string>;
}

export interface LoadProposalFactsInput {
  churchId: ChurchId;
  cycleId: CycleId;
  ministryId: MinistryId;
  /** Already read in this transaction; read here when absent. */
  eventGroups?: EventWithEventTimeBlocks[];
  tx: TransactionContext;
}

export interface ProposalFacts {
  facts: ProposeAssignmentsInput;
  nameByVolunteer: Map<VolunteerId, string>;
  shifts: Shift[];
  proposable: MinistryParticipation[];
}

export interface DbAssignmentProposalManagerDependencies {
  assignmentRepository: AssignmentRepository;
  availabilityCheckRepository: AvailabilityCheckRepository;
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  assignmentLifecycle: IAssignmentLifecycle;
  ministryRepository: MinistryRepository;
  participationRepository: MinistryParticipationRepository;
  proposalApplicationRepository: AssignmentProposalApplicationRepository;
  shiftRepository: ShiftRepository;
  unitOfWork: UnitOfWork;
  participationReader: IParticipationReader;
}

export interface IAssignmentProposalManager {
  /** Proposes Assignments for one Schedule between Ask and Publish; writes nothing. */
  getAssignmentProposal(
    input: GetAssignmentProposalInput,
  ): Promise<AssignmentProposalView>;
  /** Creates exactly the reviewed additions once, atomically (ADR 0013). */
  applyAssignmentProposal(
    input: ApplyAssignmentProposalInput,
  ): Promise<AssignmentProposalOutcomeView>;
}
