import { securityLog } from '@church/db';
import type {
  RecordIdentityMismatchInput,
  SecurityLogRepository,
} from '../../domain/contracts/infrastructure/security-log.repository';
import { getClient } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleSecurityLogRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleSecurityLogRepository implements SecurityLogRepository {
  constructor({ db }: DrizzleSecurityLogRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async recordIdentityMismatch({
    churchId,
    ministryInvitationId,
    actorId,
    correlationId,
    now,
    tx,
  }: RecordIdentityMismatchInput): Promise<void> {
    await getClient(this.db, tx).insert(securityLog).values({
      churchId,
      ministryInvitationId,
      actorId,
      event: 'identity_mismatch',
      correlationId,
      timestamp: now,
    });
  }
}
