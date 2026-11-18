import type { Instant } from '@church/time';
import type { ChurchId, CycleId, MinistryId, UserId } from '../../branded-ids';
import type { AppliedProposalAddition } from '../../services/assignment-proposal';
import type { TransactionContext } from './transaction-context';

/** One committed Apply and its outcome (ADR 0013). */
export interface AssignmentProposalApplication {
  churchId: ChurchId;
  applicationKey: string;
  cycleId: CycleId;
  ministryId: MinistryId;
  reviewToken: string;
  additions: AppliedProposalAddition[];
  appliedBy: UserId | null;
  appliedAt: Instant;
}

export interface FindAssignmentProposalApplicationInput {
  churchId: ChurchId;
  applicationKey: string;
  tx: TransactionContext;
}

export interface CreateAssignmentProposalApplicationInput {
  application: Omit<AssignmentProposalApplication, 'appliedAt'>;
  tx: TransactionContext;
}

export interface AssignmentProposalApplicationRepository {
  /** Null when this Church has no Apply under that key. */
  find(
    input: FindAssignmentProposalApplicationInput,
  ): Promise<AssignmentProposalApplication | null>;
  create(
    input: CreateAssignmentProposalApplicationInput,
  ): Promise<AssignmentProposalApplication>;
}
