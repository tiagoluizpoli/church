import { church, identityAudit, member } from '@church/db';
import { and, count, eq } from 'drizzle-orm';
import type { ChurchAccessLevel } from '../../domain/authority/types';
import { UserId } from '../../domain/branded-ids';
import type {
  ChurchAccessRepository,
  ChurchAccessTarget,
  CountChurchAdminsInput,
  FindChurchAccessTargetInput,
  LockChurchAccessInput,
  SaveChurchAccessChangeInput,
} from '../../domain/contracts/infrastructure/church-access.repository';
import { getClient } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleChurchAccessRepositoryInput {
  db: AnyDrizzleDb;
}

/** Church access on Better Auth's `member.role`, audited in `identity_audit`. */
export class DrizzleChurchAccessRepository implements ChurchAccessRepository {
  private readonly db: AnyDrizzleDb;

  constructor({ db }: DrizzleChurchAccessRepositoryInput) {
    this.db = db;
  }

  async lockChurch({ churchId, tx }: LockChurchAccessInput): Promise<void> {
    // NO KEY UPDATE serializes access changes without blocking the Church's FK inserts (KEY SHARE).
    await getClient({ db: this.db, tx })
      .select({ id: church.id })
      .from(church)
      .where(eq(church.id, churchId))
      .for('no key update');
  }

  async findTarget({
    churchId,
    memberId,
    tx,
  }: FindChurchAccessTargetInput): Promise<ChurchAccessTarget | undefined> {
    const [row] = await getClient({ db: this.db, tx })
      .select({ userId: member.userId, role: member.role })
      .from(member)
      .where(and(eq(member.id, memberId), eq(member.organizationId, churchId)));
    if (!row) return undefined;
    const accessLevel: ChurchAccessLevel =
      row.role === 'admin' ? 'admin' : 'member';
    return { memberId, userId: UserId.from(row.userId), accessLevel };
  }

  async countAdmins({ churchId, tx }: CountChurchAdminsInput): Promise<number> {
    const [row] = await getClient({ db: this.db, tx })
      .select({ admins: count() })
      .from(member)
      .where(
        and(eq(member.organizationId, churchId), eq(member.role, 'admin')),
      );
    return row?.admins ?? 0;
  }

  async saveChange({
    churchId,
    actorId,
    target,
    accessLevel,
    correlationId,
    changedAt,
    tx,
  }: SaveChurchAccessChangeInput): Promise<void> {
    const db = getClient({ db: this.db, tx });
    await db
      .update(member)
      .set({ role: accessLevel })
      .where(
        and(
          eq(member.id, target.memberId),
          eq(member.organizationId, churchId),
        ),
      );
    await db.insert(identityAudit).values({
      churchId,
      actorId,
      subjectId: target.userId,
      action: 'church_access_changed',
      details: {
        churchMembershipId: target.memberId,
        before: target.accessLevel,
        after: accessLevel,
      },
      correlationId,
      timestamp: changedAt,
    });
  }
}
