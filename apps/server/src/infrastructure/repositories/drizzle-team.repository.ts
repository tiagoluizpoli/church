import { team } from '@church/db';
import { and, inArray } from 'drizzle-orm';
import type { ChurchId, TeamId } from '../../domain/branded-ids';
import type { TeamRepository } from '../../domain/contracts/infrastructure/team.repository';
import type { TransactionContext } from '../../domain/contracts/infrastructure/transaction-context';
import type { Team } from '../../domain/entities/team';
import { mapTeam } from '../mappers/team.mapper';
import { getClient, withChurchIsolation } from './helpers';
import type { AnyDrizzleDb } from './types';

interface DrizzleTeamRepositoryInput {
  db: AnyDrizzleDb;
}

export class DrizzleTeamRepository implements TeamRepository {
  constructor({ db }: DrizzleTeamRepositoryInput) {
    this.db = db;
  }

  private readonly db: AnyDrizzleDb;

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
