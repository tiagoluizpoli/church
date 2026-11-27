import type { AnyDrizzleDb } from '@/infrastructure/repositories/types';

export interface DrizzleAssignmentAuditRepositoryInput {
  db: AnyDrizzleDb;
}
