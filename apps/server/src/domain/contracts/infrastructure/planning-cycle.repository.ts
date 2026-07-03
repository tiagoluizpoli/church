import type { ChurchId, PlanningCycleId } from '../../branded-ids';
import type {
  PlanningCycle,
  PlanningCycleState,
} from '../../entities/planning-cycle';
import type { TransactionContext } from './transaction-context';

export interface CreatePlanningCycleInput {
  churchId: ChurchId;
  name: string;
  startDate: Date;
  endDate: Date;
  state?: PlanningCycleState;
  tx?: TransactionContext;
}

export interface ListPlanningCyclesInput {
  churchId: ChurchId;
  state?: PlanningCycleState;
  tx?: TransactionContext;
}

export interface GetPlanningCycleInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  tx?: TransactionContext;
}

export interface FindOverlappingPlanningCyclesInput {
  churchId: ChurchId;
  startDate: Date;
  endDate: Date;
  tx?: TransactionContext;
}

export interface UpdatePlanningCycleStateInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  state: PlanningCycleState;
  tx?: TransactionContext;
}

export interface AcquirePlanningCycleChurchLockInput {
  churchId: ChurchId;
  tx: TransactionContext;
}

export interface PlanningCycleRepository {
  create(input: CreatePlanningCycleInput): Promise<PlanningCycle>;
  list(input: ListPlanningCyclesInput): Promise<PlanningCycle[]>;
  getById(input: GetPlanningCycleInput): Promise<PlanningCycle>;
  findOverlapping(
    input: FindOverlappingPlanningCyclesInput,
  ): Promise<PlanningCycle[]>;
  updateState(input: UpdatePlanningCycleStateInput): Promise<PlanningCycle>;
  acquireChurchLock(input: AcquirePlanningCycleChurchLockInput): Promise<void>;
}
