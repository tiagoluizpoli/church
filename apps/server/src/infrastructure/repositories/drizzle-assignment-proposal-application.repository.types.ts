import type { assignmentProposalApplication } from '@church/db';
import type { AnyDrizzleDb } from '@/infrastructure/repositories/drizzle-db.types';

export interface DrizzleAssignmentProposalApplicationRepositoryInput {
  db: AnyDrizzleDb;
}

export type ApplicationRow = typeof assignmentProposalApplication.$inferSelect;
