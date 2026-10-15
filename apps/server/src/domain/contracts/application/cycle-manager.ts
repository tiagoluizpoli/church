import type { ChurchId, CycleId, EventId } from '../../branded-ids';
import type { Cycle, CycleState } from '../../entities/cycle';
import type { EventWithEventTimeBlocks } from '../../entities/event';

export interface CreateCycleManagerInput {
  churchId: ChurchId;
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface ListCyclesManagerInput {
  churchId: ChurchId;
  state?: CycleState;
}

export interface GetCycleManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
}

export interface SendCycleManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
}

export interface ReopenPlanningEventManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  eventId: EventId;
}

export interface CycleDetails {
  cycle: Cycle;
  events: EventWithEventTimeBlocks[];
}

export interface ICycleManager {
  createCycle(input: CreateCycleManagerInput): Promise<Cycle>;
  listCycles(input: ListCyclesManagerInput): Promise<Cycle[]>;
  getCycle(input: GetCycleManagerInput): Promise<CycleDetails>;
  sendCycle(input: SendCycleManagerInput): Promise<void>;
  reopenEvent(input: ReopenPlanningEventManagerInput): Promise<void>;
}
