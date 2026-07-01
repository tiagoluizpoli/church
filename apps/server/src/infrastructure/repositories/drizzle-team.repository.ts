import { team } from '@church/db';
import { and, inArray } from 'drizzle-orm';
import type { ChurchId } from '../../domain/entities/church';
import type { Team, TeamId } from '../../domain/entities/team';
import type { TeamRepository } from '../../domain/repositories/team.repository';
import type { TransactionContext } from '../../domain/repositories/transaction-context';
import { getClient, withChurchIsolation } from './helpers';
import { mapTeam } from './team.mapper';
import type { AnyDrizzleDb } from './types';

export class DrizzleTeamRepository implements TeamRepository {
  constructor(private readonly db: AnyDrizzleDb) {}

  async listByIds(
    churchId: ChurchId,
    ids: TeamId[],
    tx?: TransactionContext,
  ): Promise<Team[]> {
    if (ids.length === 0) {
      return [];
    }

    const rows = await getClient(this.db, tx)
      .select()
      .from(team)
      .where(and(withChurchIsolation(team, churchId), inArray(team.id, ids)));

    return rows.map(mapTeam);
  }
}
