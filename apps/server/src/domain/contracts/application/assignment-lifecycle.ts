import type { Instant } from '@church/time';
import type {
  AssignmentId,
  ChurchId,
  ShiftId,
  ShiftRequirementId,
  UserId,
  VolunteerId,
} from '../../branded-ids';
import type { Assignment } from '../../entities/assignment';
import type { MinistryParticipation } from '../../entities/ministry-participation';
import type { Shift } from '../../entities/shift';
import type { ShiftRequirement } from '../../entities/shift-requirement';
import type {
  AssignmentEligibilityFacts,
  AssignmentRefusal,
  EligibilityCheck,
} from '../../services/assignment-eligibility';
import type { CreateParticipationAssignmentResult } from './assignment-manager';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';

/**
 * The Assignment lifecycle (#1122): every way an Assignment comes and goes,
 * with its audit row, the Schedule's move to assigning and the closing of its
 * open swap request. Eligibility rules are the pure
 * `domain/services/assignment-eligibility`. Callers authorize (ADR-0009), hold
 * the Church and Participation locks, and pass their transaction on every call.
 */

export interface RefuseInput {
  refusal: AssignmentRefusal;
  /** What a requirement outside the Shift answers; it differs per entry point. */
  notOnShift: () => Error;
}

export interface LoadAssignFactsInput {
  churchId: ChurchId;
  participation: MinistryParticipation;
  shiftId: ShiftId;
  shiftRequirementId: ShiftRequirementId;
  volunteerId: VolunteerId;
  /** The Assignment a reassignment replaces; it does not take a place. */
  replacingId?: AssignmentId;
  tx: TransactionContext;
}

export interface AssignFacts {
  facts: AssignmentEligibilityFacts;
  shift: Shift;
  /** Null when the requirement is not one of the Shift's. */
  requirement: ShiftRequirement | null;
  /** The not-found error a missing requirement answers with. */
  requirementError: Error | null;
}

export interface LoadMoveFactsInput {
  churchId: ChurchId;
  current: Assignment;
  shiftRequirementId: ShiftRequirementId;
  tx: TransactionContext;
}

export interface MoveFacts {
  facts: AssignmentEligibilityFacts;
  target: ShiftRequirement | null;
}

export interface AdmitInput {
  check: EligibilityCheck;
  facts: AssignmentEligibilityFacts;
  notOnShift: () => Error;
}

export interface AddAssignmentInput {
  churchId: ChurchId;
  shift: Shift;
  shiftRequirementId: ShiftRequirementId;
  volunteerId: VolunteerId;
  actorId: UserId;
  /** The wider act, such as an Apply's application key. */
  correlationId?: string;
  tx: TransactionContext;
}

export interface StartAssigningInput {
  churchId: ChurchId;
  participation: MinistryParticipation;
  tx: TransactionContext;
}

export interface AssignInput {
  churchId: ChurchId;
  participation: MinistryParticipation;
  volunteerId: VolunteerId;
  actorId: UserId;
  facts: AssignFacts;
  tx: TransactionContext;
}

export interface ReplaceAssignmentInput {
  churchId: ChurchId;
  replacedId: AssignmentId;
  replacement: Assignment;
  actorId: UserId;
  tx: TransactionContext;
}

export interface MoveAssignmentInput {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  shiftRequirementId: ShiftRequirementId;
  actorId: UserId;
  tx: TransactionContext;
}

export interface LifecycleExitInput {
  churchId: ChurchId;
  assignmentId: AssignmentId;
  actorId: UserId;
  tx: TransactionContext;
}

export interface ShiftStartGuardInput {
  startTime: Instant;
}

/** Loads, once and under the caller's locks, the facts eligibility reads. */
export interface IAssignmentFactsReader {
  /** Facts for placing a Volunteer on a need: manual assign and reassign. */
  forAssign(input: LoadAssignFactsInput): Promise<AssignFacts>;
  /** Facts for moving an Assignment to another need of its Shift and Role. */
  forMove(input: LoadMoveFactsInput): Promise<MoveFacts>;
}

export interface IAssignmentLifecycle {
  /** Throws the entry point's error for the refusal that takes precedence. */
  admit(input: AdmitInput): void;
  /** Refuses a change once the Shift has started; it is fixed from then on. */
  assertNotStarted(input: ShiftStartGuardInput): void;
  /**
   * Manual assign and reassign: refuses with today's errors, or adds a
   * `pending` Assignment, audits it and starts assigning. An unavailable mark
   * only warns.
   */
  assign(input: AssignInput): Promise<CreateParticipationAssignmentResult>;
  /** A `pending` Assignment with its `created` audit; eligibility was checked by the caller. */
  add(input: AddAssignmentInput): Promise<Assignment>;
  /** The first Assignment moves a Schedule from availability requested to assigning. */
  startAssigning(input: StartAssigningInput): Promise<void>;
  /** Reassign's exit for the replaced one: covers its request, deletes it, audits the replacement. */
  replace(input: ReplaceAssignmentInput): Promise<void>;
  /** Rebinds the Assignment to another need; a move never carries its request along. */
  move(input: MoveAssignmentInput): Promise<Assignment>;
  /** Audits, covers the open request and hard-deletes: a leader's removal or a move's clash withdrawal. */
  remove(input: LifecycleExitInput): Promise<void>;
  /** Keeps the row as `cancelled`, audits `event_cancelled`, covers the open request; true when it closed one. */
  cancel(input: LifecycleExitInput): Promise<boolean>;
}
