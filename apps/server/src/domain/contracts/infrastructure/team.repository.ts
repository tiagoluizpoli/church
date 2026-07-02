import type { ChurchId, TeamId } from '../../branded-ids';
import type { Team } from '../../entities/team';
import type { TransactionContext } from './transaction-context';

export interface TeamRepository {
  listByIds(
    churchId: ChurchId,
    ids: TeamId[],
    tx?: TransactionContext,
  ): Promise<Team[]>;
}
