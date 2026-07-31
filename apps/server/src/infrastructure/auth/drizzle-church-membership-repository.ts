import { church, member, organization } from '@church/db';
import { and, eq } from 'drizzle-orm';
import type { ChurchAccessLevel } from '../../domain/authority/types';
import type { ChurchId } from '../../domain/branded-ids';
import type {
  ChurchMembershipComparison,
  ChurchMembershipRepository,
  ChurchMembershipSummary,
  ListChurchMembershipsByUserIdInput,
  TouchChurchMembershipOpenedInput,
} from '../../domain/contracts/infrastructure/church-membership.repository';
import { getClient } from '../repositories/helpers';
import type { AnyDrizzleDb } from '../repositories/types';

interface DrizzleChurchMembershipRepositoryInput {
  db: AnyDrizzleDb;
}

/**
 * Reads Better Auth's `member` table directly — the same source
 * `DrizzleAuthorityActorResolver.findChurchMembership` uses for one Church,
 * this lists every Church the User belongs to, for the auto-select and
 * selection-required branches of Active Church resolution.
 */
export class DrizzleChurchMembershipRepository
  implements ChurchMembershipRepository
{
  constructor({ db }: DrizzleChurchMembershipRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

  async listByUserId(
    input: ListChurchMembershipsByUserIdInput,
  ): Promise<ChurchMembershipSummary[]> {
    const rows = await getClient(this.db, input.tx)
      .select({ organizationId: member.organizationId, role: member.role })
      .from(member)
      .where(eq(member.userId, input.userId));

    return rows.map((row) => ({
      churchId: row.organizationId as ChurchId,
      accessLevel: row.role as ChurchAccessLevel,
    }));
  }

  async listComparisonsByUserId(
    input: ListChurchMembershipsByUserIdInput,
  ): Promise<ChurchMembershipComparison[]> {
    const rows = await getClient(this.db, input.tx)
      .select({
        organizationId: member.organizationId,
        role: member.role,
        lastOpenedAt: member.lastOpenedAt,
        churchName: organization.name,
        timezone: church.timezone,
      })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .innerJoin(church, eq(church.id, member.organizationId))
      .where(eq(member.userId, input.userId));

    return rows.map((row) => ({
      churchId: row.organizationId as ChurchId,
      accessLevel: row.role as ChurchAccessLevel,
      churchName: row.churchName,
      timezone: row.timezone,
      lastOpenedAt: row.lastOpenedAt,
    }));
  }

  async touchOpened(input: TouchChurchMembershipOpenedInput): Promise<void> {
    await getClient(this.db, input.tx)
      .update(member)
      .set({ lastOpenedAt: new Date() })
      .where(
        and(
          eq(member.organizationId, input.churchId),
          eq(member.userId, input.userId),
        ),
      );
  }
}
