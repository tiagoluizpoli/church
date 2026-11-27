import type { CalendarDay } from '@church/time';
import type { ChurchId, CycleId } from '../../branded-ids';
import type {
  Cycle,
  CycleAnchors,
  CycleList,
  CyclePeriod,
  CycleState,
} from '../../entities/cycle';
import type { EventWithEventTimeBlocks } from '../../entities/event';
import type { IChurchNotifications } from '@/domain/contracts/application/church-notifications';
import type { IUsualSetupStaffingSeeder } from '@/domain/contracts/application/usual-setup-staffing-seeder';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { CycleRepository } from '@/domain/contracts/infrastructure/cycle.repository';
import type { MinistryParticipationRepository } from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { PlanningEventRepository } from '@/domain/contracts/infrastructure/planning-event.repository';
import type { TransactionContext } from '@/domain/contracts/infrastructure/transaction-context';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';
import type { VolunteerRepository } from '@/domain/contracts/infrastructure/volunteer.repository';

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

/** What is still planned: cancelled Events and EventTimeBlocks left out. */
export interface CyclePlannedCounts {
  eventCount: number;
  eventTimeBlockCount: number;
}

export interface CycleDetails {
  cycle: Cycle;
  events: EventWithEventTimeBlocks[];
  counts: CyclePlannedCounts;
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

export interface SuggestNextCycleInput {
  latestEnd: CalendarDay | null;
  churchToday: CalendarDay;
}

export interface EnsureResolvedCycleInput {
  cycle: Cycle;
  churchTimeZone: string;
  /** A write's open transaction, so its rollback undoes the Past flip. */
  tx?: TransactionContext;
}

export interface LoadSendableCycleInput {
  churchId: ChurchId;
  cycleId: CycleId;
  timeZone: string;
  tx: TransactionContext;
}

export interface SendableCycle {
  cycle: Cycle;
  draftEvents: EventWithEventTimeBlocks[];
}

export interface EnqueueCycleReadyInput {
  churchId: ChurchId;
  cycleId: CycleId;
  tx: TransactionContext;
}

export interface DbCycleManagerDependencies {
  cycleRepository: CycleRepository;
  eventRepository: PlanningEventRepository;
  churchRepository: ChurchRepository;
  unitOfWork: UnitOfWork;
  participationRepository: MinistryParticipationRepository;
  staffingSeeder: IUsualSetupStaffingSeeder;
  volunteerRepository: VolunteerRepository;
  notifications: IChurchNotifications;
}
