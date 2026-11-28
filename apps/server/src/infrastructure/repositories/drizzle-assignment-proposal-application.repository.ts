import { assignmentProposalApplication } from '@church/db';
import { fromDate } from '@church/time';
import { and, eq } from 'drizzle-orm';
import type {
  ChurchId,
  CycleId,
  MinistryId,
  UserId,
} from '../../domain/branded-ids';
import type {
  AssignmentProposalApplication,
  AssignmentProposalApplicationRepository,
  CreateAssignmentProposalApplicationInput,
  FindAssignmentProposalApplicationInput,
} from '../../domain/contracts/infrastructure/assignment-proposal-application.repository';
import type { AppliedProposalAddition } from '../../domain/services/scheduling/assignment-proposal.types';
import type {
  ApplicationRow,
  DrizzleAssignmentProposalApplicationRepositoryInput,
} from './drizzle-assignment-proposal-application.repository.types';
import type { AnyDrizzleDb } from './drizzle-db.types';
import { getClient, withChurchIsolation } from './helpers';

function toApplication(row: ApplicationRow): AssignmentProposalApplication {
  return {
    churchId: row.churchId as ChurchId,
    applicationKey: row.applicationKey,
    cycleId: row.cycleId as CycleId,
    ministryId: row.ministryId as MinistryId,
    reviewToken: row.reviewToken,
    additions: row.additions as AppliedProposalAddition[],
    appliedBy: row.appliedBy as UserId | null,
    appliedAt: fromDate({ date: row.appliedAt }),
  };
}

export class DrizzleAssignmentProposalApplicationRepository
  implements AssignmentProposalApplicationRepository
{
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleAssignmentProposalApplicationRepositoryInput) {
    this.db = db;
  }

  async find({
    churchId,
    applicationKey,
    tx,
  }: FindAssignmentProposalApplicationInput): Promise<AssignmentProposalApplication | null> {
    // list-order: lookup by primary key (church, application key)
    const [row] = await getClient({ db: this.db, tx })
      .select()
      .from(assignmentProposalApplication)
      .where(
        and(
          withChurchIsolation({
            table: assignmentProposalApplication,
            churchId,
          }),
          eq(assignmentProposalApplication.applicationKey, applicationKey),
        ),
      );
    return row ? toApplication(row) : null;
  }

  async create({
    application,
    tx,
  }: CreateAssignmentProposalApplicationInput): Promise<AssignmentProposalApplication> {
    const [row] = await getClient({ db: this.db, tx })
      .insert(assignmentProposalApplication)
      .values(application)
      .returning();
    if (!row) throw new Error('Assignment proposal application insert failed');
    return toApplication(row);
  }
}
