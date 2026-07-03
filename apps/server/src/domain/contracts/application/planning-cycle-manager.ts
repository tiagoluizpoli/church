import type { ChurchId, EventId, PlanningCycleId } from '../../branded-ids';
import type { EventWithSlots } from '../../entities/event';
import type {
  PlanningCycle,
  PlanningCycleState,
} from '../../entities/planning-cycle';

export interface CreatePlanningCycleManagerInput {
  churchId: ChurchId;
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface ListPlanningCyclesManagerInput {
  churchId: ChurchId;
  state?: PlanningCycleState;
}

export interface GetPlanningCycleManagerInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
}

export interface LockPlanningCycleManagerInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
}

export interface ReopenPlanningEventManagerInput {
  churchId: ChurchId;
  cycleId: PlanningCycleId;
  eventId: EventId;
}

export interface PlanningCycleDetails {
  cycle: PlanningCycle;
  events: EventWithSlots[];
}

export interface IPlanningCycleManager {
  createCycle(input: CreatePlanningCycleManagerInput): Promise<PlanningCycle>;
  listCycles(input: ListPlanningCyclesManagerInput): Promise<PlanningCycle[]>;
  getCycle(input: GetPlanningCycleManagerInput): Promise<PlanningCycleDetails>;
  lockCycle(input: LockPlanningCycleManagerInput): Promise<void>;
  reopenEvent(input: ReopenPlanningEventManagerInput): Promise<void>;
}
