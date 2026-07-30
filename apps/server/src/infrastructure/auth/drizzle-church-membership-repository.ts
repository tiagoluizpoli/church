import { member } from '@church/db';
import { eq } from 'drizzle-orm';
import type { ChurchAccessLevel } from '../../domain/authority/types';
import type { ChurchId } from '../../domain/branded-ids';
import type {
  ChurchMembershipRepository,
  ChurchMembershipSummary,
  ListChurchMembershipsByUserIdInput,
} from '../../domain/contracts/infrastructure/church-membership.repository';
import { getClient } from '../repositories/helpers';
import type { AnyDrizzleDb } from '../repositories/types';

/**
 * Reads Better Auth's `member` table directly — the same source
 * `DrizzleAuthorityActorResolver.findChurchMembership` uses for one Church,
 * this lists every Church the User belongs to, for the auto-select and
 * selection-required branches of Active Church resolution.
 */
export class DrizzleChurchMembershipRepository
  implements ChurchMembershipRepository
{
  constructor(private readonly db: AnyDrizzleDb) {}

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
}
