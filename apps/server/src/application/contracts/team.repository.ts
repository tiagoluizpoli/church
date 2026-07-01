import type { ChurchId } from '../../domain/entities/church';
import type { Team, TeamId } from '../../domain/entities/team';
import type { TransactionContext } from './transaction-context';

export interface TeamRepository {
  listByIds(
    churchId: ChurchId,
    ids: TeamId[],
    tx?: TransactionContext,
  ): Promise<Team[]>;
}
