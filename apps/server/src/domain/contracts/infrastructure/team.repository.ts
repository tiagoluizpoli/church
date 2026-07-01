import type { ChurchId } from '../../entities/church';
import type { Team, TeamId } from '../../entities/team';
import type { TransactionContext } from './transaction-context';

export interface TeamRepository {
  listByIds(
    churchId: ChurchId,
    ids: TeamId[],
    tx?: TransactionContext,
  ): Promise<Team[]>;
}
