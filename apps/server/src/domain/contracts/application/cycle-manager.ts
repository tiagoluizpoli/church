import type { ChurchId, CycleId } from '../../branded-ids';
import type {
  Cycle,
  CycleAnchors,
  CycleList,
  CyclePeriod,
  CycleState,
} from '../../entities/cycle';
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
  period?: CyclePeriod;
  search?: string;
  from?: Date;
  to?: Date;
}

export interface GetCycleAnchorsManagerInput {
  churchId: ChurchId;
}

export interface GetCycleManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
}

export interface SendCycleManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
}

export interface GetSendSummaryManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
}

/** Advisory Send confirmation facts; Send rechecks everything itself. */
export interface CycleSendSummary {
  eventCount: number;
  /** Distinct active Ministries the Usual setup would pre-fill. */
  prefilledMinistryCount: number;
}

export interface UpdateCycleManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface DeleteCycleManagerInput {
  churchId: ChurchId;
  cycleId: CycleId;
}

export interface CycleDetails {
  cycle: Cycle;
  events: EventWithEventTimeBlocks[];
}

export interface ICycleManager {
  createCycle(input: CreateCycleManagerInput): Promise<Cycle>;
  listCycles(input: ListCyclesManagerInput): Promise<CycleList>;
  /** The current and next Cycle for the Church's today. */
  getCycleAnchors(input: GetCycleAnchorsManagerInput): Promise<CycleAnchors>;
  getCycle(input: GetCycleManagerInput): Promise<CycleDetails>;
  getSendSummary(input: GetSendSummaryManagerInput): Promise<CycleSendSummary>;
  sendCycle(input: SendCycleManagerInput): Promise<void>;
  updateCycle(input: UpdateCycleManagerInput): Promise<Cycle>;
  deleteCycle(input: DeleteCycleManagerInput): Promise<void>;
}
