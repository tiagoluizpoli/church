import type { ChurchId, CycleId } from '../../branded-ids';
import type { Cycle, CycleState } from '../../entities/cycle';
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
  state?: CycleState;
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

export interface AcquireCycleChurchLockInput {
  churchId: ChurchId;
  tx: TransactionContext;
}

export interface CycleRepository {
  create(input: CreateCycleInput): Promise<Cycle>;
  list(input: ListCyclesInput): Promise<Cycle[]>;
  getById(input: GetCycleInput): Promise<Cycle>;
  findOverlapping(input: FindOverlappingCyclesInput): Promise<Cycle[]>;
  updateState(input: UpdateCycleStateInput): Promise<Cycle>;
  /** Writes the name and range; an overlap race is refused as OVERLAPPING_CYCLE. */
  update(input: UpdateCycleInput): Promise<Cycle>;
  /** Removes the Cycle; its Events, Time Blocks and participation cascade. */
  delete(input: DeleteCycleInput): Promise<void>;
  acquireChurchLock(input: AcquireCycleChurchLockInput): Promise<void>;
}
