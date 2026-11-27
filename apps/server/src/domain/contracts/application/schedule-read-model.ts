import type { CalendarDay } from '@church/time';
import type {
  ChurchId,
  CycleId,
  MinistryId,
  MinistryParticipationId,
} from '../../branded-ids';
import type { Cycle } from '../../entities/cycle';
import type { Ministry } from '../../entities/ministry';
import type { ScheduleStage } from '../../entities/ministry-participation';
import type {
  IScheduleChangeReader,
  ScheduleKey,
} from './schedule-change-reader';
import type { ChurchRepository } from '@/domain/contracts/infrastructure/church.repository';
import type { MinistryRepository } from '@/domain/contracts/infrastructure/ministry.repository';
import type {
  MinistryParticipationRepository,
  ScheduleCheckCountRow,
  ScheduleListRow,
} from '@/domain/contracts/infrastructure/ministry-participation.repository';
import type { UnitOfWork } from '@/domain/contracts/infrastructure/unit-of-work';

export interface ParticipationCompletionView {
  participationId: MinistryParticipationId;
  peopleNeeded: number;
  assignedCount: number;
  completionPercent: number;
}

export interface GetParticipationCompletionInput {
  churchId: ChurchId;
  participationId: MinistryParticipationId;
}

export interface ListScheduleSummariesInput {
  churchId: ChurchId;
  ministryId: MinistryId;
}

/** Iteration 3 (research.md R15/R16): one row per sent `Cycle`
 * church-wide, annotated with this ministry's participation data. A cycle
 * the ministry has zero events in still appears, with `isPartOf: false`,
 * `status: 'not_started'`, and `availabilityRequestedForAll: false`. */
export interface ScheduleSummaryView {
  cycleId: CycleId;
  name: string;
  startDate: Date;
  endDate: Date;
  isPartOf: boolean;
  eventCount: number;
  eventTimeBlockCount: number;
  status: 'not_started' | 'in_progress' | 'published';
  availabilityRequestedForAll: boolean;
  availabilityRequestedForAny: boolean;
}

/** `current` lists Sent Cycles, `past` Past Cycles, `all` both (current first). */
export const SCHEDULE_LIST_PERIOD_OPTIONS = ['current', 'past', 'all'] as const;

export type ScheduleListPeriod = (typeof SCHEDULE_LIST_PERIOD_OPTIONS)[number];

/** Combined before pagination; a new filter is one more optional field here. */
export interface ScheduleListFilters {
  period: ScheduleListPeriod;
  ministryId?: MinistryId;
  stage?: ScheduleStage;
  /** Case-insensitive substring of the Ministry name or the Cycle name. */
  search?: string;
  /** Only current Schedules that wait on the leader: unfinished, or Published with an open Swap request. */
  attention?: boolean;
}

export interface GetScheduleInsightsInput {
  churchId: ChurchId;
  /** The led Ministries a leader is scoped to; omitted for a ChurchAdmin. */
  ministryIds?: MinistryId[];
}

/** Requirement headcount and seats held; `filled` never exceeds `needed` per requirement. */
export interface StaffingView {
  needed: number;
  filled: number;
}

export interface CycleInsightView extends StaffingView {
  cycleId: string;
  name: string;
  startDate: CalendarDay;
  endDate: CalendarDay;
  asked: number;
  answered: number;
}

export interface MinistryInsightView extends StaffingView {
  ministryId: string;
  name: string;
}

export interface FocusCycleInsightView {
  cycleId: string;
  name: string;
  /** Serving Ministries, least covered first. */
  ministries: MinistryInsightView[];
}

export interface ScheduleInsightsView {
  /** The latest Sent or Past Cycles in scope, oldest first. */
  cycles: CycleInsightView[];
  /** The Cycle running on the Church's today, else the latest one; null without any. */
  focus: FocusCycleInsightView | null;
}

export interface ListSchedulesInput {
  churchId: ChurchId;
  /** The led Ministries a leader is scoped to; omitted for a ChurchAdmin. */
  ministryIds?: MinistryId[];
  filters: ScheduleListFilters;
  /** Opaque position of the last row of the previous page. */
  cursor?: string;
  limit: number;
}

/** One Schedule of a Sent or Past Cycle, within the caller's Ministries. */
export interface GetScheduleInput {
  churchId: ChurchId;
  /** The led Ministries a leader is scoped to; omitted for a ChurchAdmin. */
  ministryIds?: MinistryId[];
  ministryId: MinistryId;
  cycleId: CycleId;
}

export type ScheduleStageCounts = Record<ScheduleStage, number>;

export interface ScheduleMinistryOption {
  id: MinistryId;
  name: string;
}

export interface ScheduleListOptions {
  ministries: ScheduleMinistryOption[];
}

export interface ScheduleListPage {
  schedules: ScheduleView[];
  nextCursor?: string;
  /** Current Schedules per stage in the caller's scope, ignoring the filters and the cursor. */
  counts: ScheduleStageCounts;
  options: ScheduleListOptions;
}

export interface ScheduleAskingView {
  confirmed: number;
  asked: number;
}

/** One Ministry's part of one Sent or Past Cycle. `asking` is set only in that stage. */
export interface ScheduleView {
  affectedVolunteerCount: number;
  ministry: Ministry;
  cycle: Cycle;
  stage: ScheduleStage;
  lateMarkCount: number;
  openSwapRequestCount: number;
  gapCount: number;
  asking?: ScheduleAskingView;
}

export interface ScheduleKeyInput {
  ministryId: string;
  cycleId: string;
}

export interface ScheduleListFacts {
  checkCountsBySchedule: Map<string, ScheduleCheckCountRow>;
  lateMarksBySchedule: Map<string, number>;
  swapCountBySchedule: Map<string, number>;
  gapCountBySchedule: Map<string, number>;
  /** Volunteers with untold changes, for published Schedules only. */
  changeCountBySchedule: Map<string, number>;
}

export interface LoadScheduleListFactsInput {
  churchId: ChurchId;
  schedules: ScheduleKey[];
}

export interface ToScheduleViewInput extends ScheduleListRow {
  facts: ScheduleListFacts;
}

export interface DbScheduleReadModelDependencies {
  churchRepository: ChurchRepository;
  ministryRepository: MinistryRepository;
  participationRepository: MinistryParticipationRepository;
  unitOfWork: UnitOfWork;
  scheduleChangeReader: IScheduleChangeReader;
}

export interface IScheduleReadModel {
  listScheduleSummaries(
    input: ListScheduleSummariesInput,
  ): Promise<ScheduleSummaryView[]>;
  /** Newest Cycle first, then Ministries alphabetically. */
  listSchedules(input: ListSchedulesInput): Promise<ScheduleListPage>;
  /** Staffing and availability totals of the latest Cycles plus per-Ministry coverage of the focus Cycle. */
  getScheduleInsights(
    input: GetScheduleInsightsInput,
  ): Promise<ScheduleInsightsView>;
  /** Throws NotFoundError when the pair is out of scope or its Cycle is a Draft. */
  getSchedule(input: GetScheduleInput): Promise<ScheduleView>;
  getCompletion(
    input: GetParticipationCompletionInput,
  ): Promise<ParticipationCompletionView>;
}
