import { NotFoundError } from '@church/core';
import { compareCalendarDays, fromDateColumn, now, today } from '@church/time';
import type { CycleId } from '../domain/branded-ids';
import type { IScheduleChangeReader } from '../domain/contracts/application/schedule-change-reader';
import type {
  DbScheduleReadModelDependencies,
  GetParticipationCompletionInput,
  GetScheduleInput,
  GetScheduleInsightsInput,
  IScheduleReadModel,
  ListScheduleSummariesInput,
  ListSchedulesInput,
  ParticipationCompletionView,
  ScheduleInsightsView,
  ScheduleKeyInput,
  ScheduleListFacts,
  ScheduleListPage,
  ScheduleListPeriod,
  ScheduleStageCounts,
  ScheduleSummaryView,
  ScheduleView,
  ToScheduleViewInput,
} from '../domain/contracts/application/schedule-read-model';
import type { ChurchRepository } from '../domain/contracts/infrastructure/church.repository';
import type { MinistryRepository } from '../domain/contracts/infrastructure/ministry.repository';
import type {
  ListSchedulesFactsInput,
  MinistryParticipationRepository,
  ScheduleCountRow,
} from '../domain/contracts/infrastructure/ministry-participation.repository';
import type { UnitOfWork } from '../domain/contracts/infrastructure/unit-of-work';
import type { CycleState } from '../domain/entities/cycle';
import {
  decodeScheduleListCursor,
  encodeScheduleListCursor,
} from '../domain/schedule-list-cursor';

function scheduleKey({ ministryId, cycleId }: ScheduleKeyInput): string {
  return `${ministryId}:${cycleId}`;
}

/** Cycles the Home trend charts read: about half a year of monthly Cycles. */
const SCHEDULE_INSIGHTS_CYCLE_LIMIT = 6;

const SCHEDULE_LIST_PERIOD_CYCLE_STATES: Record<
  ScheduleListPeriod,
  CycleState[]
> = {
  current: ['sent'],
  past: ['past'],
  all: ['sent', 'past'],
};

export class DbScheduleReadModel implements IScheduleReadModel {
  private readonly churchRepository: ChurchRepository;
  private readonly ministryRepository: MinistryRepository;
  private readonly participationRepository: MinistryParticipationRepository;
  private readonly unitOfWork: UnitOfWork;
  private readonly scheduleChangeReader: IScheduleChangeReader;

  constructor({
    churchRepository,
    ministryRepository,
    participationRepository,
    unitOfWork,
    scheduleChangeReader,
  }: DbScheduleReadModelDependencies) {
    this.churchRepository = churchRepository;
    this.ministryRepository = ministryRepository;
    this.participationRepository = participationRepository;
    this.unitOfWork = unitOfWork;
    this.scheduleChangeReader = scheduleChangeReader;
  }

  async getCompletion(
    input: GetParticipationCompletionInput,
  ): Promise<ParticipationCompletionView> {
    const { gapCount: _gapCount, ...completion } = await this.unitOfWork.run(
      (tx) =>
        this.scheduleChangeReader.readParticipationCompletion({
          churchId: input.churchId,
          participationId: input.participationId,
          tx,
        }),
    );
    return completion;
  }

  async listScheduleSummaries(
    input: ListScheduleSummariesInput,
  ): Promise<ScheduleSummaryView[]> {
    await this.ministryRepository.getById({
      churchId: input.churchId,
      id: input.ministryId,
    });

    const rows = await this.participationRepository.listScheduleSummaries({
      churchId: input.churchId,
      ministryId: input.ministryId,
    });

    return rows.map((row) => ({
      cycleId: row.cycleId as ScheduleSummaryView['cycleId'],
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      isPartOf: row.isPartOf,
      eventCount: row.eventCount,
      eventTimeBlockCount: row.eventTimeBlockCount,
      status: row.status,
      availabilityRequestedForAll: row.availabilityRequestedForAll,
      availabilityRequestedForAny: row.availabilityRequestedForAny,
    }));
  }

  async listSchedules({
    churchId,
    ministryIds,
    filters: { period, ...filters },
    cursor,
    limit,
  }: ListSchedulesInput): Promise<ScheduleListPage> {
    const [ministries, stageCounts, page] = await Promise.all([
      this.ministryRepository.listByChurch({ churchId, ids: ministryIds }),
      this.participationRepository.countCurrentSchedulesByStage({
        churchId,
        ministryIds,
      }),
      this.participationRepository.listScheduleRows({
        churchId,
        ministryIds,
        ...filters,
        cycleStates: SCHEDULE_LIST_PERIOD_CYCLE_STATES[period],
        after: cursor ? decodeScheduleListCursor({ cursor }) : undefined,
        limit,
      }),
    ]);
    const counts: ScheduleStageCounts = {
      // biome-ignore lint/style/useNamingConvention: stage names are the wire keys
      to_prepare: 0,
      asking: 0,
      assigning: 0,
      published: 0,
      // biome-ignore lint/style/useNamingConvention: stage names are the wire keys
      not_serving: 0,
    };
    for (const { stage, count } of stageCounts) counts[stage] = count;

    // Only the page's rows pay for their facts and the per-Schedule change count.
    const facts = await this.loadScheduleListFacts({
      churchId,
      ministryIds: page.rows.map(({ ministry }) => ministry.id),
      cycleIds: page.rows.map(({ cycle }) => cycle.id),
    });
    const schedules = await Promise.all(
      page.rows.map((row) => this.toScheduleView({ churchId, ...row, facts })),
    );

    return {
      schedules,
      nextCursor: page.next && encodeScheduleListCursor(page.next),
      counts,
      options: {
        ministries: ministries.map(({ id, name }) => ({ id, name })),
      },
    };
  }

  async getScheduleInsights({
    churchId,
    ministryIds,
  }: GetScheduleInsightsInput): Promise<ScheduleInsightsView> {
    const [church, rows] = await Promise.all([
      this.churchRepository.getById({ id: churchId }),
      this.participationRepository.listCycleStaffing({
        churchId,
        ministryIds,
        cycleLimit: SCHEDULE_INSIGHTS_CYCLE_LIMIT,
      }),
    ]);
    const cycles = rows.map(({ startDate, endDate, ...row }) => ({
      ...row,
      startDate: fromDateColumn({ date: startDate }),
      endDate: fromDateColumn({ date: endDate }),
    }));
    const churchDay = today({ instant: now(), timeZone: church.timezone });
    const focus =
      cycles.find(
        ({ startDate, endDate }) =>
          compareCalendarDays({ left: startDate, right: churchDay }) <= 0 &&
          compareCalendarDays({ left: churchDay, right: endDate }) <= 0,
      ) ?? cycles.at(-1);
    if (!focus) return { cycles, focus: null };
    const ministries = await this.participationRepository.listMinistryStaffing({
      churchId,
      ministryIds,
      cycleId: focus.cycleId as CycleId,
    });
    return {
      cycles,
      focus: { cycleId: focus.cycleId, name: focus.name, ministries },
    };
  }

  async getSchedule({
    churchId,
    ministryIds,
    ministryId,
    cycleId,
  }: GetScheduleInput): Promise<ScheduleView> {
    const {
      rows: [row],
    } = await this.participationRepository.listScheduleRows({
      churchId,
      ministryIds,
      ministryId,
      cycleId,
      cycleStates: ['sent', 'past'],
      limit: 1,
    });
    if (!row) throw new NotFoundError('Schedule not found');
    const facts = await this.loadScheduleListFacts({
      churchId,
      ministryIds: [ministryId],
      cycleIds: [cycleId],
    });
    return this.toScheduleView({ churchId, ...row, facts });
  }

  private async toScheduleView({
    churchId,
    ministry,
    cycle,
    stage,
    facts,
  }: ToScheduleViewInput): Promise<ScheduleView> {
    const key = scheduleKey({ ministryId: ministry.id, cycleId: cycle.id });
    const affectedVolunteerCount = await this.unitOfWork.run((tx) =>
      this.scheduleChangeReader.countScheduleChanges({
        churchId,
        ministryId: ministry.id,
        cycleId: cycle.id,
        tx,
      }),
    );
    const view: ScheduleView = {
      ministry,
      cycle,
      stage,
      lateMarkCount: facts.lateMarksBySchedule.get(key) ?? 0,
      openSwapRequestCount: facts.swapCountBySchedule.get(key) ?? 0,
      gapCount: facts.gapCountBySchedule.get(key) ?? 0,
      affectedVolunteerCount,
    };
    if (stage !== 'asking') return view;
    const { confirmed = 0, asked = 0 } =
      facts.checkCountsBySchedule.get(key) ?? {};
    return { ...view, asking: { confirmed, asked } };
  }

  private async loadScheduleListFacts(
    scope: ListSchedulesFactsInput,
  ): Promise<ScheduleListFacts> {
    const hasScope = scope.ministryIds.length > 0 && scope.cycleIds.length > 0;
    const [checkCounts, lateMarkCounts, swapCounts, gapCounts] = hasScope
      ? await Promise.all([
          this.participationRepository.countScheduleChecks(scope),
          this.participationRepository.countScheduleLateMarks(scope),
          this.participationRepository.countScheduleOpenSwapRequests(scope),
          this.participationRepository.countScheduleGaps(scope),
        ])
      : [[], [], [], []];
    const countEntry = (row: ScheduleCountRow): [string, number] => [
      scheduleKey(row),
      row.count,
    ];
    return {
      checkCountsBySchedule: new Map(
        checkCounts.map((row) => [scheduleKey(row), row]),
      ),
      lateMarksBySchedule: new Map(lateMarkCounts.map(countEntry)),
      swapCountBySchedule: new Map(swapCounts.map(countEntry)),
      gapCountBySchedule: new Map(gapCounts.map(countEntry)),
    };
  }
}
