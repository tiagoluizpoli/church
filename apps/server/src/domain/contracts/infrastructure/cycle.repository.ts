import type { CalendarDay } from '@church/time';
import type { ChurchId, CycleId } from '../../branded-ids';
import type {
  Cycle,
  CycleAnchors,
  CycleState,
  CycleStateCounts,
} from '../../entities/cycle';
import type { TransactionContext } from './transaction-context';

export interface CreateCycleInput {
  churchId: ChurchId;
  name: string;
  startDate: Date;
  endDate: Date;
  state?: CycleState;
  tx?: TransactionContext;
}

export interface ListCyclesInput {
  churchId: ChurchId;
  /** Only these states; every state when absent. */
  states?: CycleState[];
  /** Case-insensitive part of the name. */
  search?: string;
  /** Only Cycles overlapping [from, to]; either bound may be open. */
  from?: Date;
  to?: Date;
  tx?: TransactionContext;
}

export interface ResolveElapsedCyclesInput {
  churchId: ChurchId;
  /** The Church's today, as the Date at its UTC midnight. */
  today: Date;
  tx?: TransactionContext;
}

export interface CountCycleEventsInput {
  churchId: ChurchId;
  cycleIds: string[];
  tx?: TransactionContext;
}

export interface FindLatestCycleEndInput {
  churchId: ChurchId;
  tx?: TransactionContext;
}

export interface CountCyclesByStateInput {
  churchId: ChurchId;
  tx?: TransactionContext;
}

export interface GetCycleInput {
  churchId: ChurchId;
  cycleId: CycleId;
  tx?: TransactionContext;
}

export interface FindOverlappingCyclesInput {
  churchId: ChurchId;
  startDate: Date;
  endDate: Date;
  /** The edited Cycle, which never conflicts with itself. */
  excludeCycleId?: CycleId;
  tx?: TransactionContext;
}

export interface UpdateCycleInput {
  churchId: ChurchId;
  cycleId: CycleId;
  name: string;
  startDate: Date;
  endDate: Date;
  tx?: TransactionContext;
}

export interface UpdateCycleStateInput {
  churchId: ChurchId;
  cycleId: CycleId;
  state: CycleState;
  tx?: TransactionContext;
}

export interface DeleteCycleInput {
  churchId: ChurchId;
  cycleId: CycleId;
  tx?: TransactionContext;
}

export interface FindCycleAnchorsInput {
  churchId: ChurchId;
  /** The Church's today, as the Date at its UTC midnight. */
  today: Date;
  tx?: TransactionContext;
}

export interface AcquireCycleChurchLockInput {
  churchId: ChurchId;
  tx: TransactionContext;
}

export interface ListCyclesByIdsInput {
  churchId: ChurchId;
  cycleIds: CycleId[];
  tx?: TransactionContext;
}

export interface CycleRepository {
  /** The Church's Cycles among the ids, in one read, ordered as `list`. */
  listByIds(input: ListCyclesByIdsInput): Promise<Cycle[]>;
  create(input: CreateCycleInput): Promise<Cycle>;
  /** Newest start first, then end, then id. */
  list(input: ListCyclesInput): Promise<Cycle[]>;
  /** How many Cycles `list` would return for the same filters. */
  count(input: ListCyclesInput): Promise<number>;
  /** Marks every Draft or Sent Cycle that ended before today as Past. */
  resolveElapsed(input: ResolveElapsedCyclesInput): Promise<void>;
  countByState(input: CountCyclesByStateInput): Promise<CycleStateCounts>;
  /** The last day of the Church's latest-ending Cycle; null with no Cycle. */
  findLatestEnd(input: FindLatestCycleEndInput): Promise<CalendarDay | null>;
  /** Events that are not cancelled, per Cycle id; a Cycle with none is absent. */
  countEvents(input: CountCycleEventsInput): Promise<Record<string, number>>;
  getById(input: GetCycleInput): Promise<Cycle>;
  findOverlapping(input: FindOverlappingCyclesInput): Promise<Cycle[]>;
  /** current: covers today, neither Draft nor Past; next: earliest start after today, not Past (Drafts included). Ties: start date, then id. */
  findAnchors(input: FindCycleAnchorsInput): Promise<CycleAnchors>;
  updateState(input: UpdateCycleStateInput): Promise<Cycle>;
  /** Writes the name and range; an overlap race is refused as OVERLAPPING_CYCLE. */
  update(input: UpdateCycleInput): Promise<Cycle>;
  /** Removes the Cycle; its Events, Time Blocks and participation cascade. */
  delete(input: DeleteCycleInput): Promise<void>;
  acquireChurchLock(input: AcquireCycleChurchLockInput): Promise<void>;
}

export interface RefuseExclusionRaceInput {
  error: unknown;
  range: Omit<FindOverlappingCyclesInput, 'tx'>;
}
