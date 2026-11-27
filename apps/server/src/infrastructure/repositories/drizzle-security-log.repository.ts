import { securityLog } from '@church/db';
import type {
  RecordIdentityMismatchInput,
  SecurityLogRepository,
} from '../../domain/contracts/infrastructure/security-log.repository';
import type { AnyDrizzleDb } from './drizzle-db.types';
import type { DrizzleSecurityLogRepositoryInput } from './drizzle-security-log.repository.types';
import { getClient } from './helpers';

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
    await getClient({ db: this.db, tx }).insert(securityLog).values({
      churchId,
      ministryInvitationId,
      actorId,
      event: 'identity_mismatch',
      correlationId,
      timestamp: now,
    });
  }
}
