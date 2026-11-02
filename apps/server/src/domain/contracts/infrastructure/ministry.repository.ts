import type { Instant } from '@church/time';
import type { ChurchId, CycleId, MinistryId } from '../../branded-ids';
import type {
  DefaultDirection,
  Ministry,
  MinistrySettings,
} from '../../entities/ministry';
import type { TransactionContext } from './transaction-context';

export interface UpdateMinistryDefaultDirectionInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  defaultDirection: DefaultDirection;
  tx?: TransactionContext;
}

export interface MinistryRepository {
  getById(input: GetMinistryByIdInput): Promise<Ministry>;

  /** Active Ministries only, alphabetical ignoring case. */
  listByChurch(input: ListMinistriesByChurchInput): Promise<Ministry[]>;

  /** Throws `MinistryNameInUseError` when an active Ministry has the name, ignoring case. */
  create(input: CreateMinistryRecordInput): Promise<Ministry>;

  /** Renames an active Ministry; `NotFoundError` when archived or out of scope. */
  rename(input: RenameMinistryRecordInput): Promise<Ministry>;

  /**
   * Locks an active Ministry for the transaction: `share` for a new-use write,
   * `update` for archive, so the two serialize. `NotFoundError` when archived
   * or out of scope.
   */
  lockActive(input: LockActiveMinistryInput): Promise<Ministry>;

  /** Distinct Cycles with an Event the Ministry participates in that ends after `now`. */
  listUnendedParticipationCycles(
    input: ListUnendedParticipationCyclesInput,
  ): Promise<ParticipationCycle[]>;

  /** Sets the archive marker; identity, name and children are kept. */
  archive(input: ArchiveMinistryRecordInput): Promise<void>;

  getSettings(input: GetMinistrySettingsInput): Promise<MinistrySettings>;

  updateDefaultDirection(
    input: UpdateMinistryDefaultDirectionInput,
  ): Promise<Ministry>;
}

export interface GetMinistryByIdInput {
  churchId: ChurchId;
  id: MinistryId;
  tx?: TransactionContext;
}

export interface ListMinistriesByChurchInput {
  churchId: ChurchId;
  /** Narrows the list to these Ministries when given. */
  ids?: MinistryId[];
  tx?: TransactionContext;
}

export interface CreateMinistryRecordInput {
  churchId: ChurchId;
  name: string;
  tx?: TransactionContext;
}

export interface RenameMinistryRecordInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  name: string;
  tx?: TransactionContext;
}

export interface GetMinistrySettingsInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  tx?: TransactionContext;
}

export interface LockActiveMinistryInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  strength: 'share' | 'update';
  tx: TransactionContext;
}

export interface ListUnendedParticipationCyclesInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  now: Instant;
  tx?: TransactionContext;
}

export interface ParticipationCycle {
  cycleId: CycleId;
  cycleName: string;
}

export interface ArchiveMinistryRecordInput {
  churchId: ChurchId;
  ministryId: MinistryId;
  archivedAt: Instant;
  tx: TransactionContext;
}
